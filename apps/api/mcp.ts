import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as Sentry from "@sentry/bun";
import { db } from "@workspace/database";
// The same tools Oewang uses for WhatsApp / Chat — schemas + execution come from
// the Python AI sidecar (apps/ai).
import { AiSidecarClient } from "./modules/ai/ai-sidecar-client";
import { TransactionsService } from "./modules/transactions/transactions.service";
// Initialize Sentry just like the main API, though optional for local MCP
import "./instrument";

const server = new Server(
  {
    name: "oewang-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Helper to auto-resolve a local developer's workspace and user ID.
 * In a real production MCP setup, you might pass these via env vars or tool arguments.
 * Here we grab the first User to make it seamless for the IDE local environment.
 */
async function getLocalActor() {
  const localUser = await db.query.users.findFirst();
  if (!localUser || !localUser.workspace_id) {
    throw new Error(
      "No users or workspaces found in local database. Please run the seeder or create an account.",
    );
  }
  return {
    userId: localUser.id,
    workspaceId: localUser.workspace_id,
  };
}

// 1. Register the Tools List
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await AiSidecarClient.toolDefinitions();
  // We append a simple 'get_transactions' tool to the sidecar AI tools
  const mcpTools = [
    {
      name: "get_transactions",
      description:
        "List the most recent financial transactions for the active workspace.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of transactions to fetch (default 10)",
          },
        },
      },
    },
    ...tools.map((entry: any) => {
      const fn = entry.function ?? entry;
      return {
        name: fn.name,
        description: fn.description,
        inputSchema: fn.parameters,
      };
    }),
  ];

  return {
    tools: mcpTools,
  };
});

// 2. Handle Tool Execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const actor = await getLocalActor();

    if (name === "get_transactions") {
      const limit = (args as any)?.limit || 10;
      // We pass 1 for page, and 'limit' for the pagination size
      const data = await TransactionsService.list(actor.workspaceId, {
        page: 1,
        limit: limit,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    }

    // For all other tools, route them through the Python sidecar (same logic the
    // WhatsApp/website chat uses).
    const { result } = await AiSidecarClient.executeTool(
      name,
      args,
      actor.workspaceId,
      actor.userId,
    );

    if (!result?.success) {
      return {
        isError: true,
        content: [{ type: "text", text: result?.error ?? "Tool failed" }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
    };
  } catch (error: any) {
    Sentry.captureException(error);
    return {
      isError: true,
      content: [{ type: "text", text: error.message || String(error) }],
    };
  }
});

// Start the stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🚀 Oewang MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP Server:", error);
  process.exit(1);
});
