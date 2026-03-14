import Anthropic from "@anthropic-ai/sdk";
import { TransactionsService } from "../transactions/transactions.service";
import { walletsRepository } from "../wallets/wallets.repository";
import { CategoriesRepository } from "../categories/categories.repository";

export const aiTools: Anthropic.Tool[] = [
  {
    name: "create_transaction",
    description: "Create a new financial transaction (income, expense, or transfer)",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense", "transfer"], description: "Type of transaction. If unknown, ask the user." },
        amount: { type: "number", description: "Numerical amount. Must be confirmed with the user if missing." },
        date: { type: "string", description: "ISO date string. Default to today if not mentioned." },
        name: { type: "string", description: "Name/Merchant of the transaction (e.g., 'Starbucks')." },
        walletId: { type: "string", description: "Source wallet/account ID or name. If the user doesn't specify an account, LIST the available wallets and ask them to choose." },
        toWalletId: { type: "string", description: "Destination wallet ID or name (required for transfers only)." },
        categoryId: { type: "string", description: "Category ID or name. If unclear, pick the best match from context or ask the user." },
        description: { type: "string", description: "Optional notes." },
      },
      required: ["type", "amount", "name", "walletId"],
    },
  },
  {
    name: "update_transaction",
    description: "Update an existing transaction",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        amount: { type: "number" },
        name: { type: "string" },
        categoryId: { type: "string" },
        description: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_transaction",
    description: "Delete a transaction",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    },
  },
];


// Helper to check if string is a UUID
const isUuid = (id: string) => /^[a-f0-9-]{36}$/i.test(id);

export async function executeAiTool(
  toolName: string,
  input: any,
  workspaceId: string,
  userId: string,
): Promise<any> {
  try {
    switch (toolName) {
      case "create_transaction": {
        let walletId = input.walletId;
        let categoryId = input.categoryId;

        // Robustness: Resolve walletId from name if not a UUID
        if (walletId && !isUuid(walletId)) {
          const allWallets = await walletsRepository.findMany(workspaceId);
          const match = allWallets.find((w: any) =>
            w.name.toLowerCase().includes(walletId.toLowerCase())
          );
          if (match) walletId = match.id;
        }

        // Robustness: Resolve categoryId from name if not a UUID
        if (categoryId && !isUuid(categoryId)) {
          const allCats = await CategoriesRepository.findMany(workspaceId);
          const match = allCats.find((c: any) =>
            c.name.toLowerCase().includes(categoryId.toLowerCase())
          );
          if (match) categoryId = match.id;
        }

        const body = {
          type: input.type,
          amount: input.amount,
          date: input.date || new Date().toISOString(),
          name: input.name,
          walletId,
          toWalletId: input.toWalletId,
          categoryId,
          description: input.description,
        };

        const result = await TransactionsService.create(
          workspaceId,
          userId,
          body,
        );
        return { success: true, data: result.data };
      }
      case "update_transaction": {
        const { id, ...body } = input;
        const result = await TransactionsService.update(
          workspaceId,
          userId,
          id,
          body,
        );
        return { success: true, data: result.data };
      }
      case "delete_transaction": {
        const result = await TransactionsService.delete(
          workspaceId,
          userId,
          input.id,
        );
        return { success: true, data: result.data };
      }
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error: any) {
    console.error(`[AI Tool Error] ${toolName}:`, error);
    return { success: false, error: error.message || String(error) };
  }
}
