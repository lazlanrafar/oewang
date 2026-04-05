import { GoogleGenerativeAI, type Part } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { PDFExtract } from "pdf.js-extract";
import { ParsedReceipt } from "../types";
import { log } from "../utils/logger";

export interface ReceiptProviderOptions {
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
}

export abstract class ReceiptService {
  static async parse(
    base64: string,
    mimeType: string,
    categoryContext: string,
    options: ReceiptProviderOptions
  ): Promise<ParsedReceipt | null> {
    const systemPrompt = `You are an AI receipt parser. Extract the relevant financial data exactly as JSON with these keys:
{
  "amount": number, // total amount paid
  "date": "YYYY-MM-DDTHH:mm:ss.000Z", // iso string date
  "name": string, // name of merchant or store
  "categoryId": string, // The ID of the most appropriate category for the overall transaction
  "items": [ // Array of individual products/line items found on the receipt
    {
      "name": string, // Product/item name (e.g. "Dove Soap 200ml")
      "brand": string | null, // Brand name if identifiable (e.g. "Dove"), otherwise null
      "quantity": number | null, // Quantity purchased (e.g. 2), null if not shown
      "unit": string | null, // Unit of measure: "pcs", "kg", "g", "ml", "L", etc. null if not shown
      "unitPrice": number | null, // Price per unit, null if not shown
      "amount": number, // Total line amount for this item (required)
      "categoryId": string | null // ID of the best matching category for this specific item, or null
    }
  ]
}

Available Expense Categories (use these IDs for both the transaction and individual items):
${categoryContext || "No categories found. Return null for categoryId."}

Rules:
- Extract EVERY distinct line item from the receipt into the "items" array
- If a line item has no quantity shown, set quantity to null and unitPrice to null
- The "amount" field in items is the total for that line (quantity * unitPrice if both shown, or the line total as printed)
- Handle Currency Scale: Look for numerical consistency. In currencies like IDR/VND (e.g., merchant is in Indonesia), item prices are often shorthand (e.g., "39" for 39,000). If the items sum up to roughly the total when multiplied by 1000, do so. In USD/EUR, keep the small numbers. Use dots/commas as scale hints (209.055 is likely 209,055 in IDR, but 209.05 in USD). The final item sum + taxes must roughly match the total.
- If no line items can be identified (e.g. blurry image or total-only receipt), return an empty "items" array []
- Return ONLY the JSON object, no markdown, no extra text`;

    let pdfText = "";
    if (mimeType === "application/pdf") {
      try {
        const buffer = Buffer.from(base64, "base64");
        const pdfExtract = new PDFExtract();
        const data = await pdfExtract.extractBuffer(buffer);
        pdfText = data.pages.map((p: any) => p.content.map((i: any) => i.str).join(" ")).join("\n");
      } catch (e: any) {
        log.error("PDF parse failed", { error: e.message || e });
      }
    }

    const prompt = pdfText
      ? `Document text:\n${pdfText}\n\nExtract receipt data as JSON.`
      : "Extract receipt data from this image as JSON.";

    // 1. Gemini
    if (options.geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(options.geminiKey);
        const model = genAI.getGenerativeModel({
          model: "gemini-flash-latest",
          systemInstruction: systemPrompt,
        });

        let parts: Part[] = [{ text: prompt }];
        if (!pdfText) {
          parts.push({ inlineData: { mimeType, data: base64 } });
        }

        const result = await model.generateContent(parts);
        const text = result.response.text();
        if (text) {
          const parsed = JSON.parse(text.trim().replace(/```json|```/g, ""));
          return parsed;
        }
      } catch (e: any) {
        log.error("Gemini parseReceipt failed", { error: e.message || e });
      }
    }

    // 2. OpenAI
    if (options.openaiKey) {
      try {
        const openai = new OpenAI({ apiKey: options.openaiKey });
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: pdfText ? prompt : [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
            ]
          }
        ];
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          response_format: { type: "json_object" },
        });
        const parsed = JSON.parse(response.choices[0]?.message.content || "{}");
        return parsed;
      } catch (e: any) {
        log.error("OpenAI parseReceipt failed", { error: e.message || e });
      }
    }

    // 3. Claude
    if (options.anthropicKey) {
      try {
        const client = new Anthropic({ apiKey: options.anthropicKey });
        const messagesContent: any[] = pdfText
          ? [{ type: "text", text: prompt }]
          : [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType as any,
                  data: base64,
                },
              },
              { type: "text", text: prompt },
            ];

        const response = await client.messages.create({
          model: "claude-3-haiku-20240307",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: messagesContent }],
        });
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
        if (textBlock) {
          const parsed = JSON.parse(textBlock.text.trim().replace(/```json|```/g, ""));
          return parsed;
        }
      } catch (e: any) {
        log.error("Claude parseReceipt failed", { error: e.message || e });
      }
    }

    return null;
  }
}
