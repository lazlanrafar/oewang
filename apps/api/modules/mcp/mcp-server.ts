import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AiSidecarClient } from "../ai/ai-sidecar-client";

/**
 * Build the per-request MCP server. Tool schemas + execution come from the Python
 * AI sidecar (apps/ai) — the same source the WhatsApp/website chat uses. Async
 * because the schemas are fetched over HTTP at build time.
 */
export async function createMcpServer(
  workspaceId: string,
  userId: string,
): Promise<McpServer> {
  const server = new McpServer({
    name: "oewang",
    version: "1.0.0",
    title: "Oewang",
    description:
      "Financial management — transactions, budgets, wallets, invoices, and reports",
  });

  const tools = await AiSidecarClient.toolDefinitions();

  for (const entry of tools) {
    // Sidecar tools are OpenAI function specs: { function: { name, description, parameters } }
    const fn = entry.function ?? entry;
    const name: string = fn.name;
    const description: string = fn.description ?? "";
    const params = fn.parameters ?? {};
    const shape: Record<string, z.ZodTypeAny> = {};

    if (params.properties) {
      for (const [key, prop] of Object.entries(
        params.properties as Record<string, any>,
      )) {
        if (prop.anyOf) {
          shape[key] = z
            .string()
            .nullable()
            .optional()
            .describe(prop.description ?? "");
        } else if (prop.type === "string") {
          shape[key] = z
            .string()
            .optional()
            .describe(prop.description ?? "");
        } else if (prop.type === "number" || prop.type === "integer") {
          shape[key] = z
            .number()
            .optional()
            .describe(prop.description ?? "");
        } else if (prop.type === "boolean") {
          shape[key] = z
            .boolean()
            .optional()
            .describe(prop.description ?? "");
        } else {
          shape[key] = z
            .any()
            .optional()
            .describe(prop.description ?? "");
        }
      }
    }

    server.tool(name, description, shape, async (args) => {
      const { result } = await AiSidecarClient.executeTool(
        name,
        args,
        workspaceId,
        userId,
      );
      if (!result?.success) {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: result?.error ?? "Tool failed" },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result.data, null, 2) },
        ],
      };
    });
  }

  return server;
}
