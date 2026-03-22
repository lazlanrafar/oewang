import { TransactionsService } from "../transactions/transactions.service";
import { walletsRepository } from "../wallets/wallets.repository";
import { CategoriesRepository } from "../categories/categories.repository";
import { ContactsRepository } from "../contacts/contacts.repository";
import { DebtsService } from "../debts/debts.service";

// Tool definitions are now managed in @workspace/ai/tools/tool.definitions.ts


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
