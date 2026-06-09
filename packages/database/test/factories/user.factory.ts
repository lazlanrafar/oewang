import { faker } from "@faker-js/faker";
import { eq } from "drizzle-orm";
import { users } from "../../schema/users";
import { workspaces } from "../../schema/workspaces";
import { BaseFactory, type DB } from "./base-factory";

export interface UserAttributes {
  id?: string;
  email?: string;
  name?: string;
  profile_picture?: string;
  mobile?: string;
  oauth_provider?: string;
  providers?: string[];
  workspace_id?: string;
  system_role?: "superadmin" | "owner" | "finance" | "user";
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Factory for creating test users
 */
export class UserFactory extends BaseFactory<UserAttributes> {
  protected defaultAttributes(): Partial<UserAttributes> {
    return {
      id: this.generateId(),
      email: this.uniqueEmail(),
      name: faker.person.fullName(),
      profile_picture: faker.image.avatar(),
      mobile: faker.phone.number(),
      oauth_provider: undefined,
      providers: [],
      system_role: "user",
      created_at: new Date(),
      updated_at: new Date(),
    };
  }

  protected async insert(
    attributes: Partial<UserAttributes>,
  ): Promise<UserAttributes> {
    const [user] = await this.db
      .insert(users)
      .values(attributes as any)
      .returning();
    return user! as UserAttributes;
  }

  /**
   * Create user with workspace
   */
  async withWorkspace(workspaceName?: string) {
    const user = await this.create();

    // Create workspace for user
    const [workspace] = await this.db
      .insert(workspaces)
      .values({
        id: this.generateId(),
        name: workspaceName || `${user.name}'s Workspace`,
        slug: faker.helpers
          .slugify(`${user.name}-${this.generateId().slice(0, 8)}`)
          .toLowerCase(),
        plan_status: "free",
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning();

    // Update user with workspace_id
    const [updatedUser] = await this.db
      .update(users)
      .set({ workspace_id: workspace!.id })
      .where(eq(users.id, user.id!))
      .returning();

    return { user: updatedUser!, workspace: workspace! };
  }

  /**
   * Create superadmin user
   */
  async superadmin() {
    return this.create({ system_role: "superadmin" });
  }

  /**
   * Create owner user
   */
  async owner() {
    return this.create({ system_role: "owner" });
  }

  /**
   * Create OAuth user
   */
  async oauth(provider: string = "google") {
    return this.create({
      oauth_provider: provider,
      providers: [provider],
    });
  }
}
