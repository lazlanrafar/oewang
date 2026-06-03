import { db } from "@workspace/database";
import { sql } from "drizzle-orm";

export abstract class HealthRepository {
  static async ping() {
    await db.execute(sql`SELECT 1`);
  }
}
