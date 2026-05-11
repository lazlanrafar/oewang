import { db, systemSettings } from "@workspace/database";
import { eq } from "drizzle-orm";

export abstract class SystemSettingsRepository {
  static async getSetting(key: string): Promise<string | null> {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));

    return setting?.value ?? null;
  }

  static async setSetting(key: string, value: string): Promise<void> {
    await db
      .insert(systemSettings)
      .values({ key, value, updated_at: new Date().toISOString() })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value, updated_at: new Date().toISOString() },
      });
  }
}
