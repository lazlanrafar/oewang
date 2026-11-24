// Boekti for OpenCode, written by `boekti init` (wiki: boekti init). All logic lives in
// `boekti hook`; this file only forwards events. The default export at the end fits the
// OpenCode version that is installed.

const EDIT = new Set(["edit", "write", "patch", "multiedit", "apply_patch"])
const TRACK = new Set([...EDIT, "bash"])

type Usage = { model: string; input: number; output: number; reasoning: number; cache_read: number; cache_write: number; cost: number }

// boekti pipes one JSON payload to `boekti hook --cli opencode <hook>` and answers its stdout.
// Any failure answers "": Boekti never blocks work by being down.
async function boekti(hook: string, payload: Record<string, unknown>): Promise<string> {
  try {
    const p = Bun.spawn(["boekti", "hook", "--cli", "opencode", hook], {
      stdin: new Blob([JSON.stringify(payload)]), stdout: "pipe", stderr: "ignore",
    })
    const out = await new Response(p.stdout).text()
    await p.exited
    return out
  } catch {
    return ""
  }
}

function denied(out: string): string | undefined {
  try {
    const d = JSON.parse(out)?.hookSpecificOutput
    return d?.permissionDecision === "deny" ? d.permissionDecisionReason : undefined
  } catch {
    return undefined
  }
}

// Running usage per session, summed here because the usage events fire many times a turn.
const usage = new Map<string, Usage>()
const perMessage = new Map<string, Usage>()
const args = new Map<string, unknown>()

function total(session: string): Usage | undefined {
  return usage.get(session)
}

function addStep(session: string, model: string, t: any, cost: number) {
  const u = usage.get(session) ?? { model, input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, cost: 0 }
  u.model = model || u.model
  u.input += t?.input ?? 0
  u.output += t?.output ?? 0
  u.reasoning += t?.reasoning ?? 0
  u.cache_read += t?.cache?.read ?? 0
  u.cache_write += t?.cache?.write ?? 0
  u.cost += cost ?? 0
  usage.set(session, u)
}

// setMessage keeps the latest usage of one assistant message (V1 message.updated).
function setMessage(m: any) {
  if (m?.role !== "assistant" || !m.sessionID || !m.tokens) return
  const prev = perMessage.get(m.id)
  if (prev) {
    const u = usage.get(m.sessionID)
    if (u) {
      u.input -= prev.input; u.output -= prev.output; u.reasoning -= prev.reasoning
      u.cache_read -= prev.cache_read; u.cache_write -= prev.cache_write; u.cost -= prev.cost
    }
  }
  const t = m.tokens
  perMessage.set(m.id, { model: m.modelID ?? "", input: t.input ?? 0, output: t.output ?? 0, reasoning: t.reasoning ?? 0, cache_read: t.cache?.read ?? 0, cache_write: t.cache?.write ?? 0, cost: m.cost ?? 0 })
  addStep(m.sessionID, m.modelID ?? "", t, m.cost ?? 0)
}

async function before(cwd: string, tool: string, session: string, call: string, input: unknown) {
  if (TRACK.has(tool)) args.set(call, input)
  if (!EDIT.has(tool)) return
  const reason = denied(await boekti("pre-edit", { hook_event_name: "PreToolUse", session_id: session, cwd, tool_name: tool, tool_input: input }))
  if (reason) throw new Error(reason)
}

function after(cwd: string, tool: string, session: string, call: string) {
  if (!TRACK.has(tool)) return
  const input = args.get(call)
  args.delete(call)
  void boekti("event", { hook_event_name: "PostToolUse", session_id: session, cwd, tool_name: tool, tool_input: input })
}

function end(cwd: string, session: string, name: "Stop" | "SessionEnd") {
  void boekti("event", { hook_event_name: name, session_id: session, cwd, usage: total(session) })
  if (name === "SessionEnd") usage.delete(session)
}

// OpenCode 1.
export const BoektiPlugin = async ({ directory }: { directory: string }) => ({
  event: async ({ event }: { event: any }) => {
    const p = event?.properties ?? {}
    switch (event?.type) {
      case "session.created": void boekti("session-start", { hook_event_name: "SessionStart", session_id: p.info?.id, cwd: p.info?.directory ?? directory, source: "startup" }); break
      case "message.updated": setMessage(p.info); break
      case "session.idle": end(directory, p.sessionID, "Stop"); break
      case "session.deleted": end(directory, p.info?.id, "SessionEnd"); break
    }
  },
  "tool.execute.before": async (input: any, output: any) => before(directory, input.tool, input.sessionID, input.callID, output?.args),
  "tool.execute.after": async (input: any) => after(directory, input.tool, input.sessionID, input.callID),
})

const context = new Map<string, string>()

// OpenCode 2's plugin: Plugin.define({ id, setup }) from @opencode/plugin.
const boektiV2 = {
  id: "boekti",
  setup(ctx: any) {
    const cwd: string = ctx.directory ?? process.cwd()
    ctx.tool.hook("execute.before", async (e: any) => before(cwd, e.tool, e.sessionID, e.callID ?? e.id, e.input))
    ctx.tool.hook("execute.after", async (e: any) => after(cwd, e.tool, e.sessionID, e.callID ?? e.id))
    // OpenCode 2 builds the system prompt again before each model request, so the start block is
    // pushed each time: pushed once, it would be gone from the second request on. It is short
    // (under 2,000 characters) and stable, so the provider's prompt cache covers it.
    ctx.session?.hook?.("context", (e: any) => {
      const text = context.get(e.sessionID)
      if (text) e.system.push({ type: "text", text })
    })
    ctx.event.subscribe(async (ev: any) => {
      const p = ev?.properties ?? ev?.data ?? {}
      const session = p.sessionID ?? p.info?.id ?? p.id
      switch (ev?.type) {
        case "session.created": {
          const text = await boekti("session-start", { hook_event_name: "SessionStart", session_id: session, cwd, source: "startup" })
          if (text.trim()) context.set(session, text)
          break
        }
        case "session.step.ended": addStep(session, p.modelID ?? p.model ?? "", p.tokens, p.cost ?? 0); break
        case "session.execution.succeeded":
        case "session.execution.failed": end(cwd, session, "Stop"); break
        case "session.deleted": end(cwd, session, "SessionEnd"); context.delete(session); break
      }
    })
  },
}

// OpenCode 1 (1.18 and later) loads a default export { id, server }, and refuses any other default
// export; OpenCode 2 loads Plugin.define({ id, setup }). Choose by the package that is installed.
const v2: any = await import("@opencode/plugin").catch(() => null)
export default v2?.Plugin?.define ? v2.Plugin.define(boektiV2) : { id: "boekti", server: BoektiPlugin }
