import { Logo } from "./assets/logo";

export const baseConfig = {
  name: "WhatsApp (Web)",
  id: "whatsapp-web",
  category: "capture",
  active: true,
  hidden: true,
  beta: true,
  logo: Logo,
  short_description:
    "Connect your personal WhatsApp number directly — no Twilio or API keys required. Scan a QR code and start capturing receipts instantly.",
  description:
    "Connect Oewang with your personal WhatsApp number using the whatsapp-web.js library.\n\n**No API Keys Required**\nUnlike the Twilio integration, this uses your own WhatsApp account — just scan a QR code with your phone's WhatsApp app.\n\n**Receipt & Invoice Upload**\nSend photos of receipts, invoices, or any documents directly from WhatsApp. Oewang extracts key data and creates transactions automatically.\n\n**AI Chat**\nAsk your AI assistant questions directly from WhatsApp — check balances, add expenses, or get financial summaries on the go.\n\n**Easy Setup**\nScan once, stay connected. Session is persisted so you don't need to scan every time.\n\n> ⚠️ Beta: This integration runs on your server and requires the server to maintain an active WhatsApp Web session.",
  settings: [
    {
      id: "receipts",
      label: "Receipt Processing",
      description:
        "Automatically process receipts and invoices sent via WhatsApp.",
      type: "switch",
      required: false,
      value: true,
    },
    {
      id: "ai_chat",
      label: "AI Chat",
      description:
        "Allow WhatsApp messages to trigger AI responses and financial queries.",
      type: "switch",
      required: false,
      value: true,
    },
  ],
};
