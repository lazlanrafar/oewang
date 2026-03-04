import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatResponse } from "./ai.dto";
import { AiRepository } from "./ai.repository";
import { CategoriesRepository } from "../categories/categories.repository";
import { aiTools, executeAiTool } from "./ai.tools";
import { PDFExtract } from "pdf.js-extract";
import { redis } from "@workspace/redis";
import { buildError } from "@workspace/utils";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { Env } from "@workspace/constants";

const SYSTEM_PROMPT_BASE = `You are Okane, a friendly and insightful personal finance assistant. You have access to the user's real financial data below and can answer questions about their spending, income, wallet balances, and financial health.

Be concise, helpful, and direct. Use bullet points and short paragraphs. Format numbers clearly. When the user asks about their data, reference real numbers from the context. If data is not available in the context, say so honestly.

If the user asks for a chart or visualization, DO NOT output ASCII art or text-based charts. Instead, output EXACTLY ONE markdown code block with the language \"chart\" containing valid JSON. The JSON must adhere to this structure:
\`\`\`chart
{
  "type": "bar", // or "line", "area", "pie", "donut"
  "title": "Income vs Expense", // optional summary title
  "description": "Last 3 months", // optional supportive text
  "data": [{"name": "Jan", "income": 100, "expense": 50}, {"name": "Feb", "income": 200, "expense": 80}],
  "xKey": "name", // Usually the category/date name
  "yKeys": ["income", "expense"] // For pie/donut, provide exactly ONE yKey (e.g. ["value"])
}
\`\`\`
Never wrap the \`\`\`chart block in anything else. Just output the block.

Never make up numbers. Always use the financial context provided.`;

export abstract class AiService {
  /**
   * Build a financial context block from the database for the given workspace.
   */
  static async buildFinancialContext(workspaceId: string): Promise<string> {
    const [recentTxns, walletSummary, spending, monthlyTotals, categories] =
      await Promise.all([
        AiRepository.getRecentTransactions(workspaceId, 20),
        AiRepository.getWalletSummary(workspaceId),
        AiRepository.getSpendingByCategory(workspaceId, 30),
        AiRepository.getMonthlyTotals(workspaceId, 3),
        CategoriesRepository.findMany(workspaceId),
      ]);

    const totalBalance = walletSummary
      .filter((w) => w.isIncludedInTotals)
      .reduce((sum, w) => sum + w.balance, 0);

    const walletLines = walletSummary
      .map((w) => `  - ${w.name}: ${w.balance.toLocaleString()} (ID: ${w.id})`)
      .join("\n");

    const categoryLines = categories
      .map((c) => `  - ${c.name} (${c.type}): ID: ${c.id}`)
      .join("\n");

    const spendingLines =
      spending.length > 0
        ? spending
            .map(
              (s) =>
                `  - ${s.categoryName ?? "Uncategorized"}: ${Number(s.total).toLocaleString()} (${s.count} transactions)`,
            )
            .join("\n")
        : "  - No expense data in the last 30 days.";

    // Group monthly totals
    const monthlyMap: Record<string, { income: number; expense: number }> = {};
    for (const row of monthlyTotals) {
      if (!monthlyMap[row.month]) {
        monthlyMap[row.month] = { income: 0, expense: 0 };
      }
      if (row.type === "income") {
        monthlyMap[row.month]!.income = Number(row.total);
      } else if (row.type === "expense") {
        monthlyMap[row.month]!.expense = Number(row.total);
      }
    }
    const monthlyLines =
      Object.keys(monthlyMap).length > 0
        ? Object.entries(monthlyMap)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(
              ([month, v]) =>
                `  - ${month}: Income ${v.income.toLocaleString()} | Expense ${v.expense.toLocaleString()} | Net ${(v.income - v.expense).toLocaleString()}`,
            )
            .join("\n")
        : "  - No monthly data available yet.";

    const recentLines =
      recentTxns.length > 0
        ? recentTxns
            .slice(0, 10)
            .map(
              (t) =>
                `  - [${t.date}] ${t.name} | ${t.type} | ${Number(t.amount).toLocaleString()} | ${t.walletName ?? "?"} | ${t.categoryName ?? "Uncategorized"} (ID: ${t.id})`,
            )
            .join("\n")
        : "  - No recent transactions found.";

    return `
## User's Financial Context (live data)

### Wallet Balances
${walletLines || "  - No wallets found."}
Total (included in totals): ${totalBalance.toLocaleString()}

### Available Categories
${categoryLines || "  - No categories found."}

### Spending by Category (last 30 days)
${spendingLines}

### Monthly Summary (last 3 months — Income | Expense | Net)
${monthlyLines}

### Recent Transactions (latest 10)
${recentLines}
`.trim();
  }

  /**
   * Helper to generate a short title for a new chat session.
   */
  static async generateTitle(firstMessage: string): Promise<string> {
    const client = new Anthropic({
      apiKey: Env.ANTHROPIC_API_KEY,
    });
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 20,
      system:
        "You are a title generator. Generate a very short (max 4 words) title summarizing the user's message. Output ONLY the title, no quotes or extra text.",
      messages: [{ role: "user", content: firstMessage }],
    });
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    return textBlock
      ? textBlock.text.trim().replace(/^['"]|['"]$/g, "")
      : "New Chat";
  }

  /**
   * Chat with Claude using the user's financial context and save to DB.
   */
  static async chat(
    messages: ChatMessage[],
    workspaceId: string,
    userId: string,
    sessionId?: string,
  ): Promise<ChatResponse> {
    const client = new Anthropic({
      apiKey: Env.ANTHROPIC_API_KEY,
    });

    let currentSessionId = sessionId;
    const latestUserMessage = messages[messages.length - 1];

    if (!latestUserMessage) {
      throw new Error("No messages provided");
    }

    if (!currentSessionId) {
      const title = await AiService.generateTitle(latestUserMessage.content);
      const newSession = await AiRepository.createSession(workspaceId, title);
      currentSessionId = newSession!.id;

      // Save all previous messages acting as history if they were passed, though typically it's just 1
      for (const msg of messages.slice(0, -1)) {
        await AiRepository.saveMessage(currentSessionId, msg.role, msg.content);
      }
    } else {
      // Verify session belongs to workspace
      const session = await AiRepository.getSession(
        currentSessionId,
        workspaceId,
      );
      if (!session) throw new Error("Chat session not found or access denied.");
    }

    await AiRepository.saveMessage(
      currentSessionId,
      latestUserMessage.role,
      latestUserMessage.content,
    );

    const usageData = await AiRepository.getUsageAndQuota(workspaceId);

    if (!usageData)
      throw status(
        404,
        buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"),
      );

    const maxTokens = usageData.maxTokens ?? 100;
    const currentTokens = Number(usageData.used);

    if (currentTokens >= maxTokens) {
      throw status(
        422,
        buildError(
          ErrorCode.PLAN_LIMIT_REACHED,
          `Monthly AI Token limit exceeded. Max: ${maxTokens} tokens.`,
        ),
      );
    }

    const financialContext = await AiService.buildFinancialContext(workspaceId);
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${financialContext}`;

    let requestMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as string,
      }));

    let response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: systemPrompt,
      tools: aiTools,
      messages: requestMessages,
    });

    while (response.stop_reason === "tool_use") {
      requestMessages.push({
        role: "assistant",
        content: response.content,
      });

      const toolResultsMsg: Anthropic.MessageParam = {
        role: "user",
        // @ts-ignore
        content: [],
      };

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const toolResult = await executeAiTool(
            block.name,
            block.input,
            workspaceId,
            userId,
          );
          // @ts-ignore
          toolResultsMsg.content.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
        }
      }

      requestMessages.push(toolResultsMsg);

      response = await client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        system: systemPrompt,
        tools: aiTools,
        messages: requestMessages,
      });
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    const reply = textBlock
      ? textBlock.text
      : "I couldn't generate a response. Please try again.";

    // Save assistant response
    await AiRepository.saveMessage(currentSessionId, "assistant", reply);

    // Increment AI tokens successfully used
    const tokensSpent =
      response.usage.input_tokens + response.usage.output_tokens;
    await AiRepository.incrementAiTokens(
      workspaceId,
      currentTokens,
      tokensSpent,
    );

    return {
      sessionId: currentSessionId,
      reply,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  }

  static async getSessions(workspaceId: string) {
    return AiRepository.getSessions(workspaceId);
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    const session = await AiRepository.getSession(sessionId, workspaceId);
    if (!session) throw new Error("Chat session not found or access denied.");
    return AiRepository.getSessionMessages(sessionId);
  }

  static async parseReceipt(
    workspaceId: string,
    base64Image: string,
    mediaType: string,
  ) {
    const client = new Anthropic({
      apiKey: Env.ANTHROPIC_API_KEY,
    });

    const categories = await CategoriesRepository.findMany(
      workspaceId,
      "expense",
    );
    const categoryLines = categories
      .map((c) => `- ${c.name} (ID: ${c.id})`)
      .join("\n");

    let pdfText = "";
    if (mediaType === "application/pdf") {
      try {
        const buffer = Buffer.from(base64Image, "base64");
        const pdfExtract = new PDFExtract();
        const data = await pdfExtract.extractBuffer(buffer);
        // Extract text from the page structures
        pdfText = data.pages
          .map((page: any) =>
            page.content.map((item: any) => item.str).join(" "),
          )
          .join("\n");
      } catch (e) {
        console.error("Failed to parse PDF locally", e);
        return null;
      }
    }

    const messagesContent: any[] = [];
    if (pdfText) {
      messagesContent.push({
        type: "text",
        text:
          "Here is the extracted text from the receipt/invoice document:\n\n" +
          pdfText +
          "\n\nExtract receipt data as JSON.",
      });
    } else {
      messagesContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as any,
          data: base64Image,
        },
      });
      messagesContent.push({
        type: "text",
        text: "Extract receipt data as JSON.",
      });
    }

    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 500,
      system: `You are an AI receipt parser. The user has uploaded an image or document text of a receipt.
Extract the relevant financial data exactly as JSON with these keys:
{
  "amount": number, // total amount
  "date": "YYYY-MM-DDTHH:mm:ss.000Z", // iso string date
  "name": string, // name of merchant or item
  "categoryId": string // The ID of the most appropriate category
}

Available Expense Categories to choose from:
${categoryLines || "No categories found. Return null for categoryId."}

Return the exact category ID that best matches. Only output the JSON object without any markdown wrapping or extra text.`,
      messages: [
        {
          role: "user",
          content: messagesContent,
        },
      ],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) return null;

    try {
      const parsed = JSON.parse(textBlock.text.trim());

      // Cache the resulting category for this merchant name
      if (parsed.name && parsed.categoryId) {
        const cacheKey = `okane:category-cache:${workspaceId}:${parsed.name.toLowerCase().trim()}`;
        await redis.set(cacheKey, parsed.categoryId, { ex: 60 * 60 * 24 * 30 }); // cache for 30 days
      }

      return parsed;
    } catch (e) {
      console.error("Failed to parse AI JSON response", e);
      return null;
    }
  }
}
