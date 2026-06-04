import { Logo } from "./assets/logo";

export default {
  name: "Cursor",
  id: "cursor-mcp",
  category: "ai-automation",
  active: true,
  hidden: false,
  logo: Logo,
  short_description:
    "Connect Cursor to your Oewang data via MCP. Ask questions about finances while you code.",
  description: `Connect Cursor to your Oewang account using the Model Context Protocol (MCP). No API key needed — authentication is handled automatically via OAuth.

**What you can do:**
- Ask about transactions, invoices, and budgets
- Generate financial reports and summaries
- Query your business data using natural language
- Get answers grounded in your real financial data

**How it works:**
1. Open Cursor and go to **Settings → MCP Servers**
2. Add the Oewang MCP server URL
3. When you first use an Oewang tool, sign in and select a workspace`,
  images: [],
};
