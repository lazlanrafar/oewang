export const DEFAULT_WALLET_GROUPS = [
  "Cash",
  "Accounts",
  "Card",
  "Debit Card",
  "Savings",
  "Top-Up / Prepaid",
  "Investments",
  "Overdrafts",
  "Loan",
  "Insurance",
  "Others",
];

export const DEFAULT_WALLETS = [
  {
    group: "Cash",
    wallets: [
      {
        name: "Cash",
        balance: 0,
        isIncludedInTotals: true,
      },
    ],
  },
  {
    group: "Accounts",
    wallets: [
      {
        name: "Accounts",
        balance: 0,
        isIncludedInTotals: true,
      },
    ],
  },
  {
    group: "Card",
    wallets: [
      {
        name: "Card",
        balance: 0,
        isIncludedInTotals: true,
      },
    ],
  },
];
