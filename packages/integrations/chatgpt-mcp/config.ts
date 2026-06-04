import { Logo } from "./assets/logo";

export default {
  name: "ChatGPT",
  id: "chatgpt-mcp",
  category: "ai-automation",
  active: true,
  hidden: false,
  logo: Logo,
  short_description:
    "Connect ChatGPT to your Oewang financial data via MCP with one-click OAuth.",
  description: `Connect ChatGPT to your Oewang account using the Model Context Protocol (MCP). No API key needed — authentication is handled automatically via OAuth.

**What you can do:**
- Query transactions, invoices, and reports in ChatGPT
- Get financial insights grounded in your real business data
- Create automated reports and summaries
- Use deep research with your private financial data

**Setup steps:**
1. In ChatGPT, go to **Settings → Connectors** and click **Create**
2. Paste the Oewang MCP URL as the connector URL
3. When you use an Oewang tool, you'll be prompted to sign in

**Requirements:** ChatGPT Pro, Plus, Business, Enterprise, or Education account.`,
  images: [],
};
