import { redis } from "@workspace/redis";
import type { AgentSettings } from "@workspace/ai";
import { AgentSettingsRepository } from "./agent-settings.repository";

const CACHE_TTL = 300; // 5 minutes

function cacheKey(workspaceId: string) {
  return `oewang:ai-settings:${workspaceId}`;
}

function rowToSettings(row: {
  model: string;
  temperature: string;
  max_steps: number;
  custom_instructions: string | null;
  response_language: string;
}): AgentSettings {
  return {
    model: row.model,
    temperature: parseFloat(row.temperature),
    maxSteps: row.max_steps,
    customInstructions: row.custom_instructions,
    responseLanguage:
      row.response_language as AgentSettings["responseLanguage"],
  };
}

export abstract class AgentSettingsService {
  static async get(workspaceId: string) {
    return AgentSettingsRepository.getOrCreate(workspaceId);
  }

  /** Load settings with a Redis cache — called on every chat request. */
  static async getCached(workspaceId: string): Promise<AgentSettings> {
    try {
      const cached = await redis.get(cacheKey(workspaceId));
      if (cached) {
        return typeof cached === "string"
          ? JSON.parse(cached)
          : (cached as AgentSettings);
      }
    } catch {}

    const row = await AgentSettingsRepository.getOrCreate(workspaceId);
    const settings = rowToSettings(row);

    try {
      await redis.set(cacheKey(workspaceId), JSON.stringify(settings), {
        ex: CACHE_TTL,
      });
    } catch {}

    return settings;
  }

  static async update(
    workspaceId: string,
    patch: {
      model?: string | undefined;
      temperature?: number | undefined;
      max_steps?: number | undefined;
      custom_instructions?: string | null | undefined;
      response_language?: string | undefined;
    },
  ) {
    const dbPatch: Record<string, any> = {};
    if (patch.model !== undefined) dbPatch.model = patch.model;
    if (patch.temperature !== undefined)
      dbPatch.temperature = String(patch.temperature.toFixed(2));
    if (patch.max_steps !== undefined) dbPatch.max_steps = patch.max_steps;
    if ("custom_instructions" in patch)
      dbPatch.custom_instructions = patch.custom_instructions;
    if (patch.response_language !== undefined)
      dbPatch.response_language = patch.response_language;
    const row = await AgentSettingsRepository.upsert(workspaceId, dbPatch);

    // Bust cache so next request picks up the new settings
    try {
      await redis.del(cacheKey(workspaceId));
    } catch {}

    return row;
  }
}
