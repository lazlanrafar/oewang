import { 
  ExtractionService, 
  parseFileToAiInput, 
  type ExtractedTransaction 
} from "@workspace/ai";
import { walletsRepository } from "../wallets/wallets.repository";
import { TransactionsRepository } from "./transactions.repository";
import { CategoriesRepository } from "../categories/categories.repository";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import { buildSuccess, buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { Env } from "@workspace/constants";
import { status } from "elysia";

export abstract class TransactionsImportService {
  static async importFromFile(
    workspaceId: string,
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
    filename: string,
  ) {
    // 1. Fetch wallets and existing categories for AI context and ID resolution
    const [wallets, existingCategories] = await Promise.all([
      walletsRepository.findMany(workspaceId),
      CategoriesRepository.findMany(workspaceId),
    ]);

    const walletNames = wallets.map((w) => w.name);
    const categoryNames = existingCategories.map((c) => c.name);

    const walletMap = new Map(wallets.map((w) => [w.name.toLowerCase(), w.id]));
    // category map: name → { id, type }
    const categoryMap = new Map(
      existingCategories.map((c) => [c.name.toLowerCase(), c]),
    );

    // 2. Parse file → AI input
    const aiInput = parseFileToAiInput(fileBuffer, mimeType, filename);

    // 3. Call AI
    let extracted: ExtractedTransaction[];
    try {
      extracted = await ExtractionService.extractTransactions(
        aiInput,
        walletNames,
        categoryNames,
        {
          geminiKey: process.env.GEMINI_API_KEY,
          openaiKey: process.env.OPENAI_API_KEY,
          anthropicKey: process.env.ANTHROPIC_API_KEY,
        }
      );
    } catch (err: any) {
      console.error("[AI Import Error]:", err);
      if (err.message?.includes("No AI provider configured")) {
        throw status(
          422,
          buildError(
            ErrorCode.VALIDATION_ERROR,
            "No AI provider configured. Add Gemini/OpenAI/Anthropic keys.",
          ),
        );
      }
      throw status(
        500,
        buildError(
          ErrorCode.INTERNAL_ERROR,
          `AI extraction failed: ${err.message || JSON.stringify(err)}`,
        ),
      );
    }

    if (extracted.length === 0) {
      return buildSuccess(
        { imported: 0, skipped: 0, transactions: [] },
        "No transactions found in the provided file",
      );
    }

    // 4. Auto-create any categories the AI named that don't exist yet
    const newCategoryNames = new Set<string>();
    for (const tx of extracted) {
      if (!tx.categoryName) continue;
      const key = tx.categoryName.toLowerCase();
      if (!categoryMap.has(key)) {
        newCategoryNames.add(tx.categoryName);
      }
    }

    if (newCategoryNames.size > 0) {
      const toCreate = Array.from(newCategoryNames).map((name) => ({
        workspaceId,
        name,
        // Infer type from the transaction that mentions this category
        type: (extracted.find(
          (t) => t.categoryName?.toLowerCase() === name.toLowerCase(),
        )?.type === "income"
          ? "income"
          : "expense") as "income" | "expense",
      }));

      const created = await CategoriesRepository.createMany(toCreate);
      // Merge newly created categories into the map
      for (const cat of created) {
        categoryMap.set(cat.name.toLowerCase(), cat);
      }
    }

    // 5. Default wallet (first available)
    const defaultWalletId: string | undefined = wallets[0]?.id;

    // 6. Bulk create transactions
    const created: Awaited<ReturnType<typeof TransactionsRepository.create>>[] =
      [];
    let skipped = 0;

    for (const tx of extracted) {
      const resolvedWalletId: string | undefined =
        (tx.walletName
          ? walletMap.get(tx.walletName.toLowerCase())
          : undefined) ?? defaultWalletId;

      if (!resolvedWalletId) {
        skipped++;
        continue;
      }

      const resolvedCategoryId: string | undefined = tx.categoryName
        ? (categoryMap.get(tx.categoryName.toLowerCase())?.id ?? undefined)
        : undefined;

      const amount = String(tx.amount);

      try {
        const transaction = await TransactionsRepository.create({
          workspaceId,
          walletId: resolvedWalletId,
          categoryId: resolvedCategoryId,
          amount,
          date: tx.date,
          type: tx.type,
          name: tx.name,
          description: tx.description,
        });

        // Adjust wallet balance
        const val = Number(amount);
        if (tx.type === "expense") {
          await walletsRepository.updateBalance(
            resolvedWalletId,
            workspaceId,
            -val,
          );
        } else if (tx.type === "income") {
          await walletsRepository.updateBalance(
            resolvedWalletId,
            workspaceId,
            val,
          );
        }

        await auditLogsService.log({
          workspace_id: workspaceId,
          user_id: userId,
          action: "transaction.imported",
          entity: "transaction",
          entity_id: transaction.id,
          after: transaction,
        });

        created.push(transaction);
      } catch {
        skipped++;
      }
    }

    return buildSuccess(
      { imported: created.length, skipped, transactions: created },
      `Imported ${created.length} transaction${created.length !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped}` : ""}`,
    );
  }
}
