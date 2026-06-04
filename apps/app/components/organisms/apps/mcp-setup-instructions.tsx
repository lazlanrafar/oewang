"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

const MCP_URL = `${process.env.NEXT_PUBLIC_API_URL}/mcp`;

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group flex w-full items-center gap-2 border border-border bg-secondary px-3 py-2.5 text-left transition-colors hover:border-foreground/30"
    >
      <span className="flex-1 truncate font-mono text-xs">{url}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-foreground" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      )}
    </button>
  );
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <div className="border border-border bg-secondary">
        <pre className="p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">
          <code>{code}</code>
        </pre>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 border border-border bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check size={12} className="text-foreground" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function SetupStep({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-border bg-secondary font-mono text-[10px] text-muted-foreground">
        {number}
      </span>
      <span className="pt-0.5 text-xs text-[#878787]">{children}</span>
    </li>
  );
}

export function CursorSetupInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#878787]">
        Connect Cursor to your Oewang account via MCP. No API key needed — authentication is handled
        automatically via OAuth.
      </p>

      <div className="space-y-2">
        <p className="text-xs text-[#878787]">Add this URL as your MCP server in Cursor:</p>
        <CopyableUrl url={MCP_URL} />
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-medium text-primary">Setup steps</p>
        <ol className="space-y-2.5">
          <SetupStep number={1}>
            Open Cursor and go to{" "}
            <span className="font-medium text-primary">Settings → MCP Servers</span>
          </SetupStep>
          <SetupStep number={2}>Click <span className="font-medium text-primary">Add Server</span> and paste the URL above</SetupStep>
          <SetupStep number={3}>
            When you first use an Oewang tool, sign in and select your workspace
          </SetupStep>
        </ol>
      </div>
    </div>
  );
}

export function ClaudeSetupInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#878787]">
        Connect Claude to your Oewang account via MCP. No API key needed — authentication is handled
        automatically via OAuth.
      </p>

      <Tabs defaultValue="app" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="app" className="flex-1 text-xs">
            Claude.ai / Desktop
          </TabsTrigger>
          <TabsTrigger value="code" className="flex-1 text-xs">
            Claude Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="app" className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-[#878787]">Copy this URL and add it as a connector in Claude:</p>
            <CopyableUrl url={MCP_URL} />
          </div>
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-primary">Setup steps</p>
            <ol className="space-y-2.5">
              <SetupStep number={1}>
                Go to{" "}
                <span className="font-medium text-primary">Settings → Connectors</span> and click{" "}
                <span className="font-medium text-primary">Add custom connector</span>
              </SetupStep>
              <SetupStep number={2}>Paste the URL above as the server URL</SetupStep>
              <SetupStep number={3}>
                When you use an Oewang tool, you'll be prompted to sign in
              </SetupStep>
            </ol>
          </div>
        </TabsContent>

        <TabsContent value="code" className="mt-3 space-y-4">
          <div className="space-y-2">
            <p className="text-xs text-[#878787]">
              Run this command to add the Oewang MCP server. OAuth will be handled automatically:
            </p>
            <CopyableCode code={`claude mcp add --transport http oewang ${MCP_URL}`} />
          </div>
          <div className="space-y-2.5">
            <p className="text-xs font-medium text-primary">Setup steps</p>
            <ol className="space-y-2.5">
              <SetupStep number={1}>Run the command above in your terminal</SetupStep>
              <SetupStep number={2}>
                When prompted, sign in to Oewang in your browser and select a workspace
              </SetupStep>
              <SetupStep number={3}>
                Use <span className="font-mono">@oewang</span> in Claude Code to access your financial
                data
              </SetupStep>
            </ol>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function PerplexitySetupInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#878787]">
        Connect Perplexity to your Oewang account via MCP. No API key needed — authentication is
        handled automatically via OAuth.
      </p>

      <div className="space-y-2">
        <p className="text-xs text-[#878787]">Copy this URL and add it as a connector in Perplexity:</p>
        <CopyableUrl url={MCP_URL} />
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-medium text-primary">Setup steps</p>
        <ol className="space-y-2.5">
          <SetupStep number={1}>
            In Perplexity, go to{" "}
            <span className="font-medium text-primary">Settings → Connectors</span> and click{" "}
            <span className="font-medium text-primary">Create</span>
          </SetupStep>
          <SetupStep number={2}>Paste the URL above as the connector URL</SetupStep>
          <SetupStep number={3}>
            When you use an Oewang tool, you'll be prompted to sign in and select a workspace
          </SetupStep>
        </ol>
      </div>
    </div>
  );
}

export function ChatGPTSetupInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-[#878787]">
        Connect ChatGPT to your Oewang account via MCP. No API key needed — authentication is handled
        automatically via OAuth.
      </p>

      <div className="space-y-2">
        <p className="text-xs text-[#878787]">Copy this URL and add it as a connector in ChatGPT:</p>
        <CopyableUrl url={MCP_URL} />
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-medium text-primary">Setup steps</p>
        <ol className="space-y-2.5">
          <SetupStep number={1}>
            In ChatGPT, go to{" "}
            <span className="font-medium text-primary">Settings → Connectors</span> and click{" "}
            <span className="font-medium text-primary">Create</span>
          </SetupStep>
          <SetupStep number={2}>Paste the URL above as the connector URL</SetupStep>
          <SetupStep number={3}>
            When you use an Oewang tool, you'll be prompted to sign in and select a workspace
          </SetupStep>
        </ol>
      </div>

      <div className="border border-border bg-secondary p-3">
        <p className="text-[11px] text-[#878787]">
          <span className="font-medium text-primary">Requirements:</span> ChatGPT Pro, Plus, Business,
          Enterprise, or Education account. Enable developer mode in Settings → Apps &amp; Connectors →
          Advanced settings.
        </p>
      </div>
    </div>
  );
}
