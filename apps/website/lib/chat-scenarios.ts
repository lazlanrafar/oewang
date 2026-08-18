// Demo content shown inside the sticky phone. The first scenario is a phone
// LOCK SCREEN (a push notification), the rest are iMessage-style chats — the
// phone cycles through them as you scroll (desktop) or tap (mobile).

export type ChatMessage = {
  role: "user" | "bot";
  kind: "text" | "receipt" | "txn";
  text?: string;
  merchant?: string;
  amount?: string;
  category?: string;
};

export type ChatScenario = {
  id: string;
  label: string;
  kind: "lock" | "chat";
  notif?: { app: string; body: string; time: string };
  messages?: ChatMessage[];
};

export const CHAT_SCENARIOS: ChatScenario[] = [
  {
    id: "notification",
    label: "Get a reminder",
    kind: "lock",
    notif: {
      app: "Oewang",
      body: "Netflix Rp 186.000 is due tomorrow — tap to mark it paid.",
      time: "now",
    },
  },
  {
    id: "capture",
    label: "Capture a receipt",
    kind: "chat",
    messages: [
      { role: "user", kind: "receipt", text: "Track this 👆" },
      { role: "bot", kind: "text", text: "Logged it — categorized and filed." },
      {
        role: "bot",
        kind: "txn",
        merchant: "Kopi Kenangan",
        amount: "Rp 45.000",
        category: "Food & Drink",
      },
    ],
  },
  {
    id: "ask",
    label: "Ask about spending",
    kind: "chat",
    messages: [
      {
        role: "user",
        kind: "text",
        text: "How much did I spend on food this month?",
      },
      {
        role: "bot",
        kind: "text",
        text: "Rp 1.240.000 on Food & Drink — about 18% of your spending.",
      },
    ],
  },
  {
    id: "insights",
    label: "Weekly insights",
    kind: "chat",
    messages: [
      { role: "user", kind: "text", text: "How was my week?" },
      {
        role: "bot",
        kind: "text",
        text: "You spent Rp 2.1M this week, down 12%. Top category: Food 👏",
      },
    ],
  },
];
