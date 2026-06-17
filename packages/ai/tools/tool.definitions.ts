/**
 * AI Tool Definitions — OpenAI Strict Mode compliant.
 *
 * Rules for strict: true (OpenAI Responses API):
 *   1. `additionalProperties` MUST be `false` on every object.
 *   2. `required` MUST list EVERY key in `properties` — no exceptions.
 *   3. Optional parameters use `anyOf: [{ type: "..." }, { type: "null" }]`
 *      so the model can pass `null` instead of omitting the field.
 *
 * Gemini ignores `additionalProperties` and nullable anyOf, so these
 * definitions are safe to pass to Gemini unchanged.
 */

/** Helper: make a nullable string property */
const ns = (description: string) => ({
  anyOf: [{ type: "string" }, { type: "null" }],
  description,
});

/** Helper: make a nullable number property */
const nn = (description: string) => ({
  anyOf: [{ type: "number" }, { type: "null" }],
  description,
});

/** Helper: make a nullable boolean property */
const nb = (description: string) => ({
  anyOf: [{ type: "boolean" }, { type: "null" }],
  description,
});

export const aiToolDefinitions = [
  {
    name: "create_transaction",
    description:
      "Create a new financial transaction (income, expense, or transfer)",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["income", "expense", "transfer"],
          description: "Type of transaction. If unknown, ask the user.",
        },
        amount: {
          type: "number",
          description:
            "Numerical amount. Must be confirmed with the user if missing.",
        },
        date: ns("ISO date string. Default to today if not mentioned."),
        name: {
          type: "string",
          description: "Name/Merchant of the transaction (e.g., 'Starbucks').",
        },
        walletId: {
          type: "string",
          description:
            "Source wallet/account ID or name. If the user doesn't specify an account, USE the wallet marked [DEFAULT] in the wallet context. Only ask the user to choose if NO default wallet exists in the workspace.",
        },
        toWalletId: ns(
          "Destination wallet ID or name (required for transfers only).",
        ),
        categoryId: ns(
          "Category ID or name. If unclear, pick the best match from context or ask the user.",
        ),
        description: ns("Optional notes."),
      },
      required: [
        "type",
        "amount",
        "date",
        "name",
        "walletId",
        "toWalletId",
        "categoryId",
        "description",
      ],
    },
  },
  {
    name: "update_transaction",
    description: "Update an existing transaction",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "ID of the transaction to update." },
        amount: nn("New amount."),
        name: ns("New name/merchant."),
        categoryId: ns("New category ID or name."),
        description: ns("New notes."),
      },
      required: ["id", "amount", "name", "categoryId", "description"],
    },
  },
  {
    name: "delete_transaction",
    description: "Delete a transaction",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", description: "ID of the transaction to delete." },
      },
      required: ["id"],
    },
  },
  {
    name: "set_default_wallet",
    description:
      "Set a wallet as the workspace default account. The default account is used by Oewang Bot for transactions in chat (WhatsApp, Telegram, etc.) when the user doesn't specify an account. Use this when the user asks to change/switch/set their default account.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        walletId: {
          type: "string",
          description:
            "ID of the wallet to mark as default (must be a real ID from get_workspace_context).",
        },
      },
      required: ["walletId"],
    },
  },
  {
    name: "create_debt",
    description:
      "Create a new debt record (Hutang or Piutang) when the user owes money or someone owes them.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contactName: {
          type: "string",
          description: "Name of the person involved.",
        },
        type: {
          type: "string",
          enum: ["payable", "receivable"],
          description:
            "payable (hutang) if the user owes them, receivable (piutang) if they owe the user.",
        },
        amount: { type: "number", description: "Amount of the debt." },
        description: ns("Optional description."),
        dueDate: ns("Optional due date (ISO string)."),
      },
      required: ["contactName", "type", "amount", "description", "dueDate"],
    },
  },
  {
    name: "split_bill",
    description:
      "Create an expense transaction and split it equally with others. Auto-records receivable debts.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: { type: "number", description: "Total amount paid initially." },
        name: { type: "string", description: "Transaction name/merchant." },
        walletId: {
          type: "string",
          description:
            "Wallet to deduct the total from. If the user doesn't specify one, USE the wallet marked [DEFAULT] in the wallet context.",
        },
        categoryId: ns("Optional category ID or name."),
        contactNames: {
          type: "array",
          items: { type: "string" },
          description: "List of people the transaction is split with.",
        },
      },
      required: ["amount", "name", "walletId", "categoryId", "contactNames"],
    },
  },
  {
    name: "getRevenueSummary",
    description:
      "Analyze revenue (income/sales) — totals, trends, and growth rates.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        period: {
          anyOf: [
            {
              type: "string",
              enum: [
                "3-months",
                "6-months",
                "this-year",
                "1-year",
                "last-12-months",
                "year-to-date",
                "last-year",
              ],
            },
            { type: "null" },
          ],
          description: "Historical period for analysis.",
        },
        from: ns(
          "Optional ISO date-time start, e.g. 2026-01-01T00:00:00.000Z.",
        ),
        to: ns("Optional ISO date-time end, e.g. 2026-12-31T23:59:59.000Z."),
        currency: ns("Currency code (e.g., USD, IDR)."),
        showCanvas: nb(
          "Whether to show a visual chart/canvas for this analysis.",
        ),
      },
      required: ["period", "from", "to", "currency", "showCanvas"],
    },
  },
  {
    name: "getBurnRate",
    description: "Calculate and analyze business burn rate and runway.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        period: {
          anyOf: [
            {
              type: "string",
              enum: [
                "3-months",
                "6-months",
                "1-year",
                "last-6-months",
                "last-12-months",
                "year-to-date",
              ],
            },
            { type: "null" },
          ],
          description: "Historical period for burn analysis.",
        },
        from: ns(
          "Optional ISO date-time start, e.g. 2026-01-01T00:00:00.000Z.",
        ),
        to: ns("Optional ISO date-time end, e.g. 2026-12-31T23:59:59.000Z."),
        currency: ns("Currency code (e.g., USD, IDR)."),
        showCanvas: nb(
          "Whether to show a visual chart/canvas for this analysis.",
        ),
      },
      required: ["period", "from", "to", "currency", "showCanvas"],
    },
  },
  {
    name: "getSpendingAnalysis",
    description: "Analyze spending patterns and category breakdowns.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        period: {
          anyOf: [
            {
              type: "string",
              enum: [
                "this-month",
                "last-month",
                "last-3-months",
                "this-year",
                "year-to-date",
                "last-year",
                "last-12-months",
              ],
            },
            { type: "null" },
          ],
          description: "Time period for analysis.",
        },
        from: ns(
          "Optional ISO date-time start, e.g. 2026-01-01T00:00:00.000Z.",
        ),
        to: ns("Optional ISO date-time end, e.g. 2026-12-31T23:59:59.000Z."),
        currency: ns("Currency code (e.g., USD, IDR)."),
        showCanvas: nb(
          "Whether to show a visual chart/canvas for this analysis.",
        ),
      },
      required: ["period", "from", "to", "currency", "showCanvas"],
    },
  },
  {
    name: "add_transaction_items",
    description:
      "Add individual purchased items (line items) to an existing transaction after parsing a receipt. ALWAYS call this immediately after create_transaction when the receipt contains an items array. Never skip this step when items are available.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        transactionId: {
          type: "string",
          description: "The ID of the transaction to add items to.",
        },
        items: {
          type: "array",
          description: "List of purchased products from the receipt.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: {
                type: "string",
                description: "Product name (e.g. 'Dove Soap 200ml')",
              },
              brand: ns("Brand name (e.g. 'Dove')"),
              quantity: nn("Quantity purchased"),
              unit: ns("Unit of measure: pcs, kg, g, ml, L"),
              unitPrice: nn("Price per unit"),
              amount: {
                type: "number",
                description: "Total line amount for this item",
              },
              categoryId: ns("Category ID for this item"),
            },
            required: [
              "name",
              "brand",
              "quantity",
              "unit",
              "unitPrice",
              "amount",
              "categoryId",
            ],
          },
        },
      },
      required: ["transactionId", "items"],
    },
  },
  {
    name: "search_transaction_items",
    description:
      "Search for purchased items across all transactions. Use when the user asks about a specific product, brand, or item purchase history (e.g. 'when did I last buy Dove soap?' or 'how much do I spend on shampoo?').",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description:
            "Item name or brand to search for (e.g. 'Dove Soap', 'shampoo', 'Indomie')",
        },
        limit: nn("Max results to return (default: 10)"),
      },
      required: ["query", "limit"],
    },
  },
  {
    name: "recall_transaction",
    description:
      "Recall the user's past transactions matching a short phrase to infer the usual price, wallet, and category. Use this FIRST whenever the user sends a brief 'buy X' / 'beli X' style message WITHOUT an explicit amount (e.g. 'Buy In Mild', 'beli kopi'). Returns matching past transaction names with last price, average price, frequency, and the wallet & category usually used — so you can propose a ready-to-confirm transaction instead of asking for the amount.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description:
            "Short item/merchant phrase from the user (e.g. 'In Mild', 'kopi', 'Starbucks').",
        },
        limit: nn("Max distinct name suggestions to return (default: 5)."),
      },
      required: ["query", "limit"],
    },
  },
];
