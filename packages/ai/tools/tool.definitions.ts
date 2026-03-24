export const aiToolDefinitions = [
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
  {
    name: "getRevenueSummary",
    description: "Analyze revenue (income/sales) - totals, trends, and growth rates.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["3-months", "6-months", "this-year", "1-year"], description: "Historical period for analysis." },
        currency: { type: "string", description: "Currency code (e.g., USD, IDR)." },
        showCanvas: { type: "boolean", description: "Whether to show a visual chart/canvas for this analysis." },
      },
    },
  },
  {
    name: "getBurnRate",
    description: "Calculate and analyze business burn rate and runway.",
    input_schema: {
      type: "object",
      properties: {
        currency: { type: "string", description: "Currency code (e.g., USD, IDR)." },
        showCanvas: { type: "boolean", description: "Whether to show a visual chart/canvas for this analysis." },
      },
    },
  },
  {
    name: "getSpendingAnalysis",
    description: "Analyze spending patterns and category breakdowns.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["this-month", "last-month", "last-3-months"], description: "Time period for analysis." },
        currency: { type: "string", description: "Currency code (e.g., USD, IDR)." },
        showCanvas: { type: "boolean", description: "Whether to show a visual chart/canvas for this analysis." },
      },
    },
  },
];
