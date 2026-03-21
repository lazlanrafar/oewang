import Anthropic from "@anthropic-ai/sdk";
import { TransactionsService } from "../transactions/transactions.service";
import { walletsRepository } from "../wallets/wallets.repository";
import { CategoriesRepository } from "../categories/categories.repository";
import { ContactsRepository } from "../contacts/contacts.repository";
import { DebtsService } from "../debts/debts.service";

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
  {
    name: "create_debt",
    description: "Create a new debt record (Hutang or Piutang) when the user owes money or someone owes them.",
    input_schema: {
      type: "object",
      properties: {
        contactName: { type: "string", description: "Name of the person involved." },
        type: { type: "string", enum: ["payable", "receivable"], description: " payable (hutang) if the user owes them, receivable (piutang) if they owe the user." },
        amount: { type: "number", description: "Amount of the debt." },
        description: { type: "string" },
        dueDate: { type: "string", description: "Optional due date." },
      },
      required: ["contactName", "type", "amount"],
    },
  },
  {
    name: "split_bill",
    description: "Create an expense transaction and split it equally with others. Auto-records receivable debts.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Total amount paid initially." },
        name: { type: "string", description: "Transaction name/merchant." },
        walletId: { type: "string", description: "Wallet to deduct the total from." },
        categoryId: { type: "string" },
        contactNames: { type: "array", items: { type: "string" }, description: "List of people the transaction is split with." }
      },
      required: ["amount", "name", "walletId", "contactNames"],
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
      case "create_debt": {
        let contact = await ContactsRepository.findByName(workspaceId, input.contactName);
        if (!contact) {
          contact = await ContactsRepository.create({ workspaceId, name: input.contactName });
        }
        if (!contact) return { success: false, error: "Failed to resolve contact." };

        const body = {
          contactId: contact.id,
          type: input.type,
          amount: input.amount,
          description: input.description,
          dueDate: input.dueDate,
        };

        const result = await DebtsService.createDebt(workspaceId, userId, body);
        return { success: true, data: result.data };
      }
      case "split_bill": {
        let walletId = input.walletId;
        if (walletId && !isUuid(walletId)) {
          const allWallets = await walletsRepository.findMany(workspaceId);
          const match = allWallets.find((w: any) =>
            w.name.toLowerCase().includes(walletId.toLowerCase())
          );
          if (match) walletId = match.id;
        }

        let categoryId = input.categoryId;
        if (categoryId && !isUuid(categoryId)) {
          const allCats = await CategoriesRepository.findMany(workspaceId);
          const match = allCats.find((c: any) =>
            c.name.toLowerCase().includes(categoryId.toLowerCase())
          );
          if (match) categoryId = match.id;
        }

        const body = {
          amount: input.amount,
          name: input.name,
          walletId,
          categoryId,
          contactNames: input.contactNames,
        };

        const result = await DebtsService.splitBill(workspaceId, userId, body);
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
