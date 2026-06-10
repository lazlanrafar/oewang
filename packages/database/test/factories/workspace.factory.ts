import { faker } from "@faker-js/faker";
import { workspaces } from "../../schema/workspaces";
import { BaseFactory, type DB } from "./base-factory";

export interface WorkspaceAttributes {
  id?: string;
  name?: string;
  slug?: string;
  country?: string;
  plan_id?: string;
  plan_status?: string;
  plan_billing_interval?: "monthly" | "annual";
  ai_tokens_used?: number;
  ai_tokens_reset_at?: Date;
  vault_size_used_bytes?: number;
  extra_ai_tokens?: number;
  extra_vault_size_mb?: number;
  storage_violation_at?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Factory for creating test workspaces
 */
export class WorkspaceFactory extends BaseFactory<WorkspaceAttributes> {
  protected defaultAttributes(): Partial<WorkspaceAttributes> {
    const name = faker.company.name();
    return {
      id: this.generateId(),
      name,
      slug: faker.helpers
        .slugify(`${name}-${this.generateId().slice(0, 8)}`)
        .toLowerCase(),
      country: faker.location.countryCode(),
      plan_status: "free",
      ai_tokens_used: 0,
      ai_tokens_reset_at: new Date(),
      vault_size_used_bytes: 0,
      extra_ai_tokens: 0,
      extra_vault_size_mb: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  protected async insert(
    attributes: Partial<WorkspaceAttributes>,
  ): Promise<WorkspaceAttributes> {
    const [workspace] = await this.db
      .insert(workspaces)
      .values(attributes as any)
      .returning();
    return workspace! as WorkspaceAttributes;
  }

  /**
   * Create workspace with premium plan
   */
  async premium() {
    return this.create({
      plan_status: "active",
      plan_billing_interval: "monthly",
    });
  }

  /**
   * Create workspace with annual billing
   */
  async annual() {
    return this.create({
      plan_status: "active",
      plan_billing_interval: "annual",
    });
  }
}
