import { describe, expect, test } from "bun:test";
import { buildSystemPrompt } from "./ai.prompts";

const baseCtx = {
  currencyCode: "IDR",
  currencySymbol: "Rp",
};

describe("buildSystemPrompt", () => {
  test("should include the complexity-gated reasoning section", () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).toContain("# Task Approach: Simple vs. Complex Requests");
    expect(prompt).toContain("Never guess to keep the conversation moving.");
  });

  test("should require clarification before create_transaction on ambiguous fields", () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).toContain(
      "never invent or silently assume a category, amount, or type",
    );
  });

  test("should preserve the default-wallet exception verbatim", () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).toContain("Do NOT ask which account to use.");
  });

  test("should require confirmation before update_transaction or delete_transaction", () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).toContain("# Editing and Deleting Transactions");
    expect(prompt).toContain(
      "Never call `update_transaction` or `delete_transaction` with a guessed or best-effort ID.",
    );
  });

  test("should require confirmation before create_debt and split_bill on ambiguous input", () => {
    const prompt = buildSystemPrompt(baseCtx);
    expect(prompt).toContain("**Confirm before recording:**");
    expect(prompt).toContain("`split_bill` always splits the amount equally among participants");
  });

  test("should append session context after the static body", () => {
    const prompt = buildSystemPrompt({
      ...baseCtx,
      workspaceName: "My Workspace",
      customInstructions: "Always mention the weather.",
    });

    // The intro paragraph *mentions* "# Session Context" by name (quoted), so
    // use lastIndexOf to find the actual trailing heading, not that mention.
    const sessionIndex = prompt.lastIndexOf("# Session Context");
    const taskApproachIndex = prompt.indexOf("# Task Approach");

    expect(sessionIndex).toBeGreaterThan(-1);
    expect(taskApproachIndex).toBeGreaterThan(-1);
    expect(taskApproachIndex).toBeLessThan(sessionIndex);

    expect(prompt).toContain("Workspace primary currency: Rp (IDR)");
    expect(prompt).toContain("Workspace: My Workspace.");
    expect(prompt).toContain("# Custom Instructions\nAlways mention the weather.");
  });

  test("should select the correct language rule for auto/english/indonesian", () => {
    const auto = buildSystemPrompt({ ...baseCtx, responseLanguage: "auto" });
    const english = buildSystemPrompt({ ...baseCtx, responseLanguage: "english" });
    const indonesian = buildSystemPrompt({ ...baseCtx, responseLanguage: "indonesian" });

    expect(auto).toContain("Always match the language of the user's latest message.");
    expect(english).toContain("Always respond in English regardless of what language the user writes in.");
    expect(indonesian).toContain("Selalu respons dalam Bahasa Indonesia");
  });
});
