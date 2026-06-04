import { Logo } from "./assets/logo";

export default {
  name: "Claude",
  id: "claude-mcp",
  category: "ai-automation",
  active: true,
  hidden: false,
  logo: Logo,
  short_description:
    "Connect Claude to your Oewang data via MCP with one-click OAuth.",
  description: `Connect Claude to your Oewang account using the Model Context Protocol (MCP). No API key needed — authentication is handled automatically via OAuth.

**What you can do:**
- Analyze financial trends and patterns
- Get insights from your transaction history
- Ask questions about invoices, budgets, and reports
- Have conversations grounded in your real business data

**Claude.ai / Claude Desktop:**
1. Go to **Settings → Connectors** and click **Add custom connector**
2. Paste the Oewang MCP URL as the server URL
3. When you use an Oewang tool, you'll be prompted to sign in

**Claude Code:**
1. Run: \`claude mcp add --transport http oewang https://3002.lazlanrafar.com/mcp\`
2. When prompted, sign in to Oewang in your browser
3. Use @oewang in Claude Code to access your financial data`,
  images: [],
};
