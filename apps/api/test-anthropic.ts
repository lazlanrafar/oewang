import Anthropic from "@anthropic-ai/sdk";
import { Env } from "@workspace/constants";
const client = new Anthropic({ apiKey: Env.ANTHROPIC_API_KEY });
async function test() {
  const models = ["claude-3-sonnet-20240229", "claude-3-opus-20240229"];
  for (const m of models) {
    try {
      await client.messages.create({
        model: m,
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }]
      });
      console.log(m, "works");
    } catch (e: any) {
      console.error(m, "error:", e.message);
    }
  }
}
test();
