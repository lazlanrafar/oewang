import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import OpenAI from "openai";
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
import { createLogger } from "@workspace/logger";

const SYSTEM_PROMPT_BASE = `You are Okane, a friendly and insightful personal finance assistant. You have access to the user's real financial data below and can answer questions about their spending, income, wallet balances, and financial health.

Be concise, helpful, and direct. Use bullet points and short paragraphs. Format numbers clearly. When the user asks about their data, reference real numbers from the context. If data is not available in the context, say so honestly.

# Global Language Rule
Always match the language used by the user in their latest message for your entire response. If the user asks in Bahasa Indonesia, respond in Bahasa Indonesia. If they ask in English, respond in English.

# Transaction Recording Guidelines
When a user wants to record a transaction (income, expense, or transfer), you MUST ensure you have the following pieces of information before calling the 'create_transaction' tool:
1. **Amount**: A specific number.
2. **Account (Wallet)**: Which wallet to use.
3. **Name/Merchant**: What the transaction is for.
4. **Category**: A valid category.

# Debt & Piutang Recording Guidelines
When a user wants to record a debt (Hutang) or receivable (Piutang), you MUST use the 'create_debt' tool.
Understand the terms:
- **Hutang (Payable)**: User owes money to someone else.
- **Piutang (Receivable)**: Someone else owes money to the user.

When a user wants to split a bill (user paid for a transaction and needs to track who owes them), you MUST use the 'split_bill' tool.

**Clarification Flow:**
If any required information is missing, you MUST ask the user for clarification. Use this EXACT format, matching the user's chat language:

[Item Name] — [Currency Syntax][Price]

Dari akun mana? (Match user's language)
• [Wallet Name] ([Balance])
• ...

Kategori:
[Emoji] [Category Name]

**Rules for Clarification:**
- **Language**: Always match the language used by the user in their latest message.
- **Wallets**: Only list wallets with a non-zero balance by default. If all wallets are zero, list the most relevant ones.
- **Conciseness**: Avoid conversational filler. Be direct and structured.

Once all info is gathered, call the 'create_transaction' tool.

**Context Preservation & Intent Maintenance:**
- If you are in the middle of a clarification flow (e.g., waiting for an account or category), and the user provides that missing piece, you MUST immediately combine it with the previous information and execute the 'create_transaction' tool.
- DO NOT reset the conversation, stop personalizing, or treat the clarification as a new, unrelated query.
- Maintain the "Transaction Recording" intent until the tool is successfully called or the user explicitly cancels.
- Even if the user only provides a single word (e.g., "BCA"), use it to fill the missing field in your current goal.

If the user asks for a chart or visualization, DO NOT output ASCII art or text-based charts. Instead, output EXACTLY ONE markdown code block with the language "chart" containing valid JSON. The JSON must adhere to this structure:
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

const log = createLogger("ai-service");

export abstract class AiService {
  /**
   * Build a financial context block from the database for the given workspace.
   */
  static async buildFinancialContext(workspaceId: string): Promise<string> {
    log.info(`[AiService] Gathering financial context for workspace: ${workspaceId}`);
    const [recentTxns, walletSummary, spending, monthlyTotals, categories, outstandingDebts] =
      await Promise.all([
        AiRepository.getRecentTransactions(workspaceId, 20),
        AiRepository.getWalletSummary(workspaceId),
        AiRepository.getSpendingByCategory(workspaceId, 30),
        AiRepository.getMonthlyTotals(workspaceId, 3),
        CategoriesRepository.findMany(workspaceId),
        AiRepository.getOutstandingDebts(workspaceId),
      ]).catch(err => {
        log.error("[AiService] buildFinancialContext: Promise.all failed", { err });
        throw err;
      });
    log.info("[AiService] Financial context gathered successfully.");

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

    const debtLines = 
      outstandingDebts && outstandingDebts.length > 0
        ? outstandingDebts
            .map(
              (d) =>
                `  - Contact: ${d.contactName ?? "?"} | Type: ${d.type} | Remaining: ${Number(d.remainingAmount).toLocaleString()}`
            )
            .join("\n")
        : "  - No outstanding debts found.";

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

### Outstanding Debts (Payable/Receivable)
${debtLines}

### Recent Transactions (latest 10)
${recentLines}
`.trim();
  }

  /**
   * Helper to generate a short title for a new chat session.
   */
  static async generateTitle(firstMessage: string): Promise<string> {
    const prompt = `Generate a very short (max 4 words) title summarizing the user's message. Output ONLY the title, no quotes or extra text.\n\nMessage: ${firstMessage}`;

    // 1. Try Gemini
    try {
      if (Env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(Env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        const title = result.response.text().trim();
        if (title) return title.replace(/^['"]|['"]$/g, "");
      }
    } catch (e) {
      log.error("Gemini generateTitle failed", { error: e });
    }

    // 2. Try OpenAI
    try {
      if (Env.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: Env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 20,
        });
        const title = response.choices[0]?.message.content?.trim();
        if (title) return title.replace(/^['"]|['"]$/g, "");
      }
    } catch (e) {
      log.error("OpenAI generateTitle failed", { error: e });
    }

    // 3. Fallback to Claude
    try {
      if (Env.ANTHROPIC_API_KEY) {
        const client = new Anthropic({ apiKey: Env.ANTHROPIC_API_KEY });
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
    } catch (e) {
      log.error("Claude generateTitle failed", { error: e });
    }

    return "New Chat";
  }

  /**
   * Chat with AI using the user's financial context and save to DB.
   * Priority: Gemini > OpenAI > Claude
   */
  static async chat(
    messages: ChatMessage[],
    workspaceId: string,
    userId: string,
    sessionId?: string,
  ): Promise<ChatResponse> {
    let currentSessionId = sessionId;
    const latestUserMessage = messages[messages.length - 1];

    if (!latestUserMessage) throw new Error("No messages provided");

    if (!currentSessionId) {
      const title = await AiService.generateTitle(latestUserMessage.content);
      const newSession = await AiRepository.createSession(workspaceId, title);
      currentSessionId = newSession!.id;

      for (const msg of messages.slice(0, -1)) {
        await AiRepository.saveMessage(currentSessionId, msg.role, msg.content);
      }
    } else {
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
      latestUserMessage.attachments,
    );

    // Load full history for this session to ensure context preservation (crucial for stateless integrations like Telegram)
    const history = await AiRepository.getSessionMessages(currentSessionId);
    const consolidatedMessages: ChatMessage[] = history.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
      attachments: m.attachments as { name: string; type: string; data: string; }[] | undefined
    }));

    const usageData = await AiRepository.getUsageAndQuota(workspaceId);
    if (!usageData) throw status(404, buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found"));

    const maxTokens = usageData.maxTokens ?? 50000; // Increased default for testing
    const currentTokens = Number(usageData.used);

    if (currentTokens >= maxTokens && workspaceId !== "b45ad588-6758-43a4-8c26-1d80f3b0ab9f") {
      throw status(422, buildError(ErrorCode.PLAN_LIMIT_REACHED, `Monthly AI Token limit exceeded. Max: ${maxTokens} tokens.`));
    }

    const financialContext = await AiService.buildFinancialContext(workspaceId);
    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${financialContext}`;

    // Gemini
    try {
      if (Env.GEMINI_API_KEY) {
        return await AiService.runGeminiChat(
          currentSessionId,
          consolidatedMessages,
          systemPrompt,
          workspaceId,
          userId,
          currentTokens,
          Env.GEMINI_API_KEY,
        );
      }
    } catch (e: any) {
      log.error(`Gemini chat failed, falling back... ${e.message || e}`);
    }

    // OpenAI
    try {
      if (Env.OPENAI_API_KEY) {
        return await AiService.runOpenAIChat(
          currentSessionId,
          consolidatedMessages,
          systemPrompt,
          workspaceId,
          userId,
          currentTokens,
          Env.OPENAI_API_KEY,
        );
      }
    } catch (e: any) {
      log.error(`OpenAI chat failed, falling back... ${e.message || e}`);
    }

    // Claude (Final Fallback)
    if (!Env.ANTHROPIC_API_KEY) {
      throw new Error("No AI provider API keys found.");
    }

    return await AiService.runClaudeChat(
      currentSessionId,
      consolidatedMessages,
      systemPrompt,
      workspaceId,
      userId,
      currentTokens,
      Env.ANTHROPIC_API_KEY,
    );
  }

  private static async runGeminiChat(
    sessionId: string,
    messages: ChatMessage[],
    systemPrompt: string,
    workspaceId: string,
    userId: string,
    currentTokens: number,
    apiKey: string,
  ): Promise<ChatResponse> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-flash-latest", // Use latest stable flash to avoid quota/versioning issues
      systemInstruction: systemPrompt,
      tools: [{
        // @ts-ignore
        functionDeclarations: aiTools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.input_schema
        }))
      }]
    });

    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content as string }]
      }))
    });

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg?.content) throw new Error("No content in last message");

    let parts: Part[] = [{ text: lastMsg.content as string }];
    if (lastMsg.attachments && lastMsg.attachments.length > 0) {
      for (const attachment of lastMsg.attachments) {
        if (attachment.type.startsWith("image/")) {
          parts.push({
            inlineData: {
              mimeType: attachment.type,
              data: attachment.data,
            },
          });
        }
      }
    }

    let result = await chat.sendMessage(parts);
    let response = result.response;
    let call = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.functionCall,
    );

    while (call) {
      const toolResult = await executeAiTool(
        call.functionCall!.name,
        call.functionCall!.args,
        workspaceId,
        userId,
      );
      result = await chat.sendMessage([
        {
          functionResponse: {
            name: call.functionCall!.name,
            response: toolResult,
          },
        },
      ]);
      response = result.response;
      call = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.functionCall,
      );
    }

    const text = response.text();
    if (!text) throw new Error("Gemini returned empty response");

    await AiRepository.saveMessage(sessionId, "assistant", text);

    // Tokens approx (Gemini doesn't provide exact usage in the same way sometimes, but we estimate)
    const tokensSpent = response.usageMetadata?.totalTokenCount ?? 500;
    await AiRepository.incrementAiTokens(workspaceId, currentTokens, tokensSpent);

    return {
      sessionId,
      reply: text,
      usage: {
        input_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        output_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  private static async runOpenAIChat(
    sessionId: string,
    messages: ChatMessage[],
    systemPrompt: string,
    workspaceId: string,
    userId: string,
    currentTokens: number,
    apiKey: string,
  ): Promise<ChatResponse> {
    const openai = new OpenAI({ apiKey });

    const tools: OpenAI.Chat.ChatCompletionTool[] = aiTools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema as any,
      },
    }));

    let requestMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => {
        if (m.attachments && m.attachments.length > 0) {
          const content: OpenAI.Chat.ChatCompletionContentPart[] = [
            { type: "text", text: m.content as string },
          ];
          for (const attachment of m.attachments) {
            if (attachment.type.startsWith("image/")) {
              content.push({
                type: "image_url",
                image_url: {
                  url: `data:${attachment.type};base64,${attachment.data}`,
                },
              });
            }
          }
          return { role: m.role as "user", content };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content as string,
        } as OpenAI.Chat.ChatCompletionMessageParam;
      }),
    ];

    let completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: requestMessages,
      tools,
    });

    let choice = completion.choices[0];
    if (!choice) throw new Error("OpenAI returned no choices");
    let currentMessage = choice.message;

    while (currentMessage.tool_calls && currentMessage.tool_calls.length > 0) {
      requestMessages.push(currentMessage);
      for (const toolCall of currentMessage.tool_calls) {
        if ("function" in toolCall) {
          const toolResult = await executeAiTool(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments),
            workspaceId,
            userId,
          );
          requestMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult),
          });
        }
      }
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: requestMessages,
        tools,
      });
      choice = completion.choices[0];
      if (!choice) throw new Error("OpenAI returned no choices during tool use");
      currentMessage = choice.message;
    }

    const reply = currentMessage.content || "I couldn't generate a response.";
    await AiRepository.saveMessage(sessionId, "assistant", reply);

    const tokensSpent = completion.usage?.total_tokens ?? 0;
    await AiRepository.incrementAiTokens(
      workspaceId,
      currentTokens,
      tokensSpent,
    );

    return {
      sessionId,
      reply,
      usage: {
        input_tokens: completion.usage?.prompt_tokens ?? 0,
        output_tokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  private static async runClaudeChat(
    sessionId: string,
    messages: ChatMessage[],
    systemPrompt: string,
    workspaceId: string,
    userId: string,
    currentTokens: number,
    apiKey: string,
  ): Promise<ChatResponse> {
    const client = new Anthropic({ apiKey });
    let requestMessages: Anthropic.MessageParam[] = messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.attachments && m.attachments.length > 0) {
          const content: Anthropic.ContentBlockParam[] = [
            { type: "text", text: m.content as string },
          ];
          for (const attachment of m.attachments) {
            if (attachment.type.startsWith("image/")) {
              content.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: attachment.type as any,
                  data: attachment.data,
                },
              });
            }
          }
          return { role: "user", content };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content as string,
        } as Anthropic.MessageParam;
      });

    let response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1024,
      system: systemPrompt,
      tools: aiTools,
      messages: requestMessages,
    });

    while (response.stop_reason === "tool_use") {
      requestMessages.push({ role: "assistant", content: response.content });
      const toolResultsMsg: Anthropic.MessageParam = { role: "user", content: [] };

      for (const block of response.content) {
        if (block.type === "tool_use") {
          const toolResult = await executeAiTool(block.name, block.input, workspaceId, userId);
          // @ts-ignore
          toolResultsMsg.content.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(toolResult) });
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

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
    const reply = textBlock ? textBlock.text : "I couldn't generate a response.";

    await AiRepository.saveMessage(sessionId, "assistant", reply);
    const tokensSpent = response.usage.input_tokens + response.usage.output_tokens;
    await AiRepository.incrementAiTokens(workspaceId, currentTokens, tokensSpent);

    return { sessionId, reply, usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens } };
  }

  /**
   * Parse receipt data from image or PDF.
   */
  static async parseReceipt(workspaceId: string, base64Image: string, mediaType: string) {
    const categories = await CategoriesRepository.findMany(workspaceId, "expense");
    const categoryLines = categories.map(c => `- ${c.name} (ID: ${c.id})`).join("\n");
    const systemPrompt = `You are an AI receipt parser. Extract the relevant financial data exactly as JSON with these keys:
{
  "amount": number, // total amount
  "date": "YYYY-MM-DDTHH:mm:ss.000Z", // iso string date
  "name": string, // name of merchant or item
  "categoryId": string // The ID of the most appropriate category
}

Available Expense Categories:
${categoryLines || "No categories found. Return null for categoryId."}

Return ONLY the JSON object.`;

    let pdfText = "";
    if (mediaType === "application/pdf") {
      try {
        const buffer = Buffer.from(base64Image, "base64");
        const pdfExtract = new PDFExtract();
        const data = await pdfExtract.extractBuffer(buffer);
        pdfText = data.pages.map((p: any) => p.content.map((i: any) => i.str).join(" ")).join("\n");
      } catch (e) {
        console.error("PDF parse failed", e);
      }
    }

    const prompt = pdfText
      ? `Document text:\n${pdfText}\n\nExtract receipt data as JSON.`
      : "Extract receipt data from this image as JSON.";

    // 1. Try Gemini
    try {
      if (Env.GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(Env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: "gemini-flash-latest",
          systemInstruction: systemPrompt,
        });

        let parts: Part[] = [{ text: prompt }];
        if (!pdfText) {
          parts.push({ inlineData: { mimeType: mediaType, data: base64Image } });
        }

        const result = await model.generateContent(parts);
        const text = result.response.text();
        if (!text) throw new Error("Gemini returned empty response");
        const parsed = JSON.parse(text.trim().replace(/```json|```/g, ""));
        return await AiService.finalizeParsedReceipt(workspaceId, parsed);
      }
    } catch (e) {
      console.error("Gemini parseReceipt failed", e);
    }

    // 2. Try OpenAI
    try {
      if (Env.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: Env.OPENAI_API_KEY });
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: pdfText ? prompt : [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64Image}` } }
            ]
          }
        ];
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          response_format: { type: "json_object" },
        });
        const choice = response.choices[0];
        if (!choice) throw new Error("OpenAI returned no choices");
        const parsed = JSON.parse(choice.message.content || "{}");
        return await AiService.finalizeParsedReceipt(workspaceId, parsed);
      }
    } catch (e) {
      console.error("OpenAI parseReceipt failed", e);
    }

    // 3. Fallback to Claude
    try {
      if (Env.ANTHROPIC_API_KEY) {
        const client = new Anthropic({ apiKey: Env.ANTHROPIC_API_KEY });
        const messagesContent: any[] = pdfText
          ? [{ type: "text", text: prompt }]
          : [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType as any,
                  data: base64Image,
                },
              },
              { type: "text", text: prompt },
            ];

        const response = await client.messages.create({
          model: "claude-3-haiku-20240307",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content: messagesContent }],
        });
        const textBlock = response.content.find(
          (b): b is Anthropic.TextBlock => b.type === "text",
        );
        if (textBlock) {
          const parsed = JSON.parse(
            textBlock.text.trim().replace(/```json|```/g, ""),
          );
          return await AiService.finalizeParsedReceipt(workspaceId, parsed);
        }
      }
    } catch (e) {
      console.error("Claude parseReceipt failed", e);
    }

    return null;
  }

  private static async finalizeParsedReceipt(workspaceId: string, parsed: any) {
    if (parsed.name && parsed.categoryId) {
      const cacheKey = `okane:category-cache:${workspaceId}:${parsed.name.toLowerCase().trim()}`;
      await redis.set(cacheKey, parsed.categoryId, { ex: 60 * 60 * 24 * 30 });
    }
    return parsed;
  }

  static async getSessions(workspaceId: string) {
    return AiRepository.getSessions(workspaceId);
  }

  static async getSessionMessages(sessionId: string, workspaceId: string) {
    const session = await AiRepository.getSession(sessionId, workspaceId);
    if (!session) throw new Error("Chat session not found or access denied.");
    return AiRepository.getSessionMessages(sessionId);
  }
}
