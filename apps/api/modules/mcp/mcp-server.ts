import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { aiToolDefinitions } from "@workspace/ai";
import { z } from "zod";
import { executeAiTool } from "../ai/ai.tools";

export function createMcpServer(workspaceId: string, userId: string): McpServer {
  const server = new McpServer({
    name: "oewang",
    version: "1.0.0",
    title: "Oewang",
    description: "Financial management — transactions, budgets, wallets, invoices, and reports",
  });

  for (const tool of aiToolDefinitions) {
    const shape: Record<string, z.ZodTypeAny> = {};

    if (tool.input_schema?.properties) {
      for (const [key, prop] of Object.entries(tool.input_schema.properties as Record<string, any>)) {
        if (prop.anyOf) {
          shape[key] = z.string().nullable().optional().describe(prop.description ?? "");
        } else if (prop.type === "string") {
          shape[key] = z.string().optional().describe(prop.description ?? "");
        } else if (prop.type === "number") {
          shape[key] = z.number().optional().describe(prop.description ?? "");
        } else if (prop.type === "boolean") {
          shape[key] = z.boolean().optional().describe(prop.description ?? "");
        } else {
          shape[key] = z.any().optional().describe(prop.description ?? "");
        }
      }
    }

    server.tool(tool.name, tool.description ?? "", shape, async (args) => {
      const result = await executeAiTool(tool.name, args, workspaceId, userId);
      if (!result.success) {
        return { isError: true, content: [{ type: "text" as const, text: result.error ?? "Tool failed" }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
    });
  }

  return server;
}
