import chatgptMcpApp from "./chatgpt-mcp/config";
import claudeMcpApp from "./claude-mcp/config";
import cursorMcpApp from "./cursor-mcp/config";
import gmailApp from "./gmail/config-client";
import outlookApp from "./outlook/config-client";
import perplexityMcpApp from "./perplexity-mcp/config";
import telegramApp from "./telegram/config-client";
import whatsappApp from "./whatsapp/config-client";

export const apps = [
  gmailApp,
  outlookApp,
  whatsappApp,
  telegramApp,
  cursorMcpApp,
  claudeMcpApp,
  perplexityMcpApp,
  chatgptMcpApp,
];

export { gmailApp, outlookApp };
