import { Intent } from "../types";
import { detectIntentByRules } from "./intent.rules";

export abstract class IntentService {
  static detectIntent(text: string): Intent {
    // Currently only Phase 1: Rule-based
    // Phase 2 could involve an LLM call for better classification
    return detectIntentByRules(text);
  }
}
