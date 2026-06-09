import { ChatMessage, Intent } from "../types";
import { detectIntentByRules } from "./intent.rules";

export abstract class IntentService {
  static detectIntent(text: string, history?: ChatMessage[]): Intent {
    // If we have history, check if the previous assistant message asked for clarification
    if (history && history.length > 1) {
      const prevMessage = history[history.length - 2];
      if (prevMessage && prevMessage.role === "assistant") {
        const content = prevMessage.content.toLowerCase();
        // If the assistant was asking for clarification of a transaction (e.g. "Dari akun mana?" or "Kategori:")
        if (
          content.includes("dari akun mana?") ||
          content.includes("kategori:")
        ) {
          return "create_transaction";
        }
      }
    }
    return detectIntentByRules(text);
  }
}
