import { aiAgentSettings, db, eq } from "@workspace/database";

const DEFAULTS = {
  model: "gpt-4o-mini" as string,
  temperature: "0.70" as string,
  max_steps: 10 as number,
  custom_instructions: null as string | null,
  response_language: "auto" as string,
};

export abstract class AgentSettingsRepository {
  static async findByWorkspaceId(workspaceId: string) {
    const [row] = await db
      .select()
      .from(aiAgentSettings)
      .where(eq(aiAgentSettings.workspace_id, workspaceId))
      .limit(1);
    return row ?? null;
  }

  static async upsert(workspaceId: string, patch: Partial<typeof DEFAULTS>) {
    const existing =
      await AgentSettingsRepository.findByWorkspaceId(workspaceId);

    if (existing) {
      const [updated] = await db
        .update(aiAgentSettings)
        .set({ ...patch, updated_at: new Date() })
        .where(eq(aiAgentSettings.workspace_id, workspaceId))
        .returning();
      return updated!;
    }

    const [created] = await db
      .insert(aiAgentSettings)
      .values({ workspace_id: workspaceId, ...DEFAULTS, ...patch })
      .returning();
    return created!;
  }

  static async getOrCreate(workspaceId: string) {
    const existing =
      await AgentSettingsRepository.findByWorkspaceId(workspaceId);
    if (existing) return existing;

    const [created] = await db
      .insert(aiAgentSettings)
      .values({ workspace_id: workspaceId, ...DEFAULTS })
      .returning();
    return created!;
  }
}
