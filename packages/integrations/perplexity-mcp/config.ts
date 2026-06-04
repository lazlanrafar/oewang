import { Logo } from "./assets/logo";

export default {
  name: "Perplexity",
  id: "perplexity-mcp",
  category: "ai-automation",
  active: true,
  hidden: false,
  logo: Logo,
  short_description:
    "Connect Perplexity to your Oewang data with AI-powered search.",
  description: `Connect Perplexity to your Oewang account using the Model Context Protocol (MCP). No API key needed — authentication is handled automatically via OAuth.

**What you can do:**
- Query your financial data using natural language
- Get instant answers about transactions, invoices, and reports
- Combine Perplexity's AI search with your real business data

**Setup steps:**
1. In Perplexity, go to **Settings → Connectors** and click **Create**
2. Paste the Oewang MCP URL as the connector URL
3. When you use an Oewang tool, you'll be prompted to sign in`,
  images: [],
};
