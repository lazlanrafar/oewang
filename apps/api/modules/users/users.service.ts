import * as path from "node:path";
import { BucketClient } from "@workspace/bucket";
import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { normalizeWorkspaceRole } from "../workspaces/workspace-permissions";
import { UsersRepository } from "./users.repository";
import { WorkspacesRepository } from "../workspaces/workspaces.repository";

export abstract class UsersService {
  private static async getBucketClient() {
    if (
      !Env.BUCKET_ENDPOINT ||
      !Env.BUCKET_ACCESS_KEY_ID ||
      !Env.BUCKET_SECRET_ACCESS_KEY ||
      !Env.BUCKET_NAME
    ) {
      throw new Error("S3 bucket storage not configured for avatars");
    }

    return new BucketClient({
      endpoint: Env.BUCKET_ENDPOINT,
      accessKeyId: Env.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: Env.BUCKET_SECRET_ACCESS_KEY,
      bucketName: Env.BUCKET_NAME,
      region: Env.BUCKET_REGION,
    });
  }

  /** Look up a user by email. */
  static async findByEmail(email: string) {
    return UsersRepository.findByEmail(email);
  }

  /**
   * Resolve the active workspace_id for a user.
   * Returns the user's stored workspace_id, or falls back to the first active membership.
   */
  static async resolveWorkspaceId(user_id: string): Promise<string> {
    const stored = await UsersRepository.getWorkspaceId(user_id);
    if (stored) return stored;

    const memberships = await UsersRepository.getMemberships(user_id);
    return memberships[0]?.workspace_id ?? "";
  }

  /**
   * Create a new user with a hashed password (email/password auth).
   */
  static async createWithPassword(data: {
    email: string;
    name?: string | null;
    password_hash: string;
  }) {
    await UsersRepository.upsert({
      email: data.email,
      name: data.name,
      password_hash: data.password_hash,
      oauth_provider: "email",
    });
    const user = await UsersRepository.findByEmail(data.email);
    if (!user) throw new Error("Failed to create user");
    return user;
  }

  /**
   * Upsert a user and their oauth_accounts row from an OAuth provider callback.
   * Lookup order: oauth_accounts → users.email → create new.
   */
  static async upsertFromOAuth(data: {
    provider: string;
    provider_user_id: string;
    email: string;
    name?: string | null;
    avatar_url?: string | null;
  }) {
    // 1. Check if we already have an oauth_accounts row for this provider identity
    const oauthRow = await UsersRepository.findOAuthAccount(
      data.provider,
      data.provider_user_id,
    );
    let user_id: string;

    if (oauthRow) {
      user_id = oauthRow.user_id;
      // Refresh profile fields if they changed
      await UsersRepository.update(user_id, {
        name: data.name ?? undefined,
        profile_picture: data.avatar_url ?? undefined,
        oauth_provider: data.provider,
      });
    } else {
      // 2. Look up by email (user may have registered with email/password before)
      const existing = await UsersRepository.findByEmail(data.email);
      if (existing) {
        user_id = existing.id;
      } else {
        // 3. Create new user
        await UsersRepository.upsert({
          email: data.email,
          name: data.name,
          profile_picture: data.avatar_url,
          oauth_provider: data.provider,
          providers: [data.provider],
        });
        const created = await UsersRepository.findByEmail(data.email);
        if (!created) throw new Error("Failed to create user from OAuth");
        user_id = created.id;
      }
    }

    // 4. Upsert oauth_accounts row
    await UsersRepository.upsertOAuthAccount({
      user_id,
      provider: data.provider,
      provider_user_id: data.provider_user_id,
      provider_email: data.email,
      provider_name: data.name,
      provider_avatar: data.avatar_url,
    });

    const user = await UsersRepository.findById(user_id);
    if (!user) throw new Error("User not found after upsert");
    return user;
  }

  /**
   * Sync a user record from external data (used by existing sync endpoint).
   */
  static async syncUser(data: {
    id: string;
    email: string;
    name?: string | null;
    oauth_provider?: string | null;
    profile_picture?: string | null;
    providers?: string[] | null;
  }) {
    try {
      const providers = Array.isArray(data.providers) ? data.providers : null;

      await UsersRepository.upsert({
        id: data.id,
        email: data.email,
        name: data.name,
        oauth_provider: data.oauth_provider,
        profile_picture: data.profile_picture,
        providers,
      });

      const memberships = await UsersRepository.getMemberships(data.id);
      const has_workspace = memberships.length > 0;
      let workspace_id: string | null = null;

      if (has_workspace) {
        const current_workspace_id = await UsersRepository.getWorkspaceId(
          data.id,
        );
        workspace_id =
          current_workspace_id ?? memberships[0]?.workspace_id ?? null;
      }

      if (workspace_id) {
        await AuditLogsService.log({
          workspace_id,
          user_id: data.id,
          action: "user.synced",
          entity: "user",
          entity_id: data.id,
        });
      }

      return { has_workspace, workspace_id };
    } catch (error: any) {
      logger.error("Sync user failed", { error, userId: data.id });
      throw error;
    }
  }

  static async getProfile(user_id: string) {
    const user = await UsersRepository.findById(user_id);
    if (!user) return null;

    let workspaces = await UsersRepository.getWorkspacesWithRole(user_id);

    // Self-heal: if workspace_id is set on the user but no membership row exists,
    // insert the missing user_workspaces row and re-fetch.
    if (workspaces.length === 0 && user.workspace_id) {
      try {
        await WorkspacesRepository.addMember({
          workspace_id: user.workspace_id,
          user_id,
          role: "owner",
        });
        workspaces = await UsersRepository.getWorkspacesWithRole(user_id);
      } catch {
        // Ignore — membership may already exist or workspace may be deleted
      }
    }

    let profile_picture = user.profile_picture;
    if (profile_picture && profile_picture.startsWith("avatars/")) {
      try {
        const bucket = await UsersService.getBucketClient();
        profile_picture = await bucket.getSignedUrl(profile_picture);
      } catch (error) {
        logger.error("Failed to sign avatar URL", { error, userId: user_id });
      }
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        profile_picture,
        mobile: user.mobile,
        workspace_id: user.workspace_id,
      },
      workspaces: workspaces.map((workspace) => ({
        ...workspace,
        role: normalizeWorkspaceRole(workspace.role),
      })),
    };
  }

  static async updateActiveWorkspace(user_id: string, workspaceId: string) {
    const memberships = await UsersRepository.getMemberships(user_id);
    const isMember = memberships.some((m) => m.workspace_id === workspaceId);

    if (!isMember) {
      throw new Error("User is not a member of this workspace");
    }

    await UsersRepository.setWorkspaceId(user_id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id,
      action: "user.workspace_switched",
      entity: "user",
      entity_id: user_id,
    });
  }

  static async updateProfile(
    user_id: string,
    data: {
      name?: string;
      profile_picture?: string | null;
      mobile?: string | null;
    },
  ) {
    await UsersRepository.update(user_id, data);
  }

  static async updateAvatar(
    user_id: string,
    file: { name: string; type: string; size: number; buffer: Buffer },
  ) {
    const user = await UsersRepository.findById(user_id);
    if (!user) throw new Error("User not found");

    const bucket = await UsersService.getBucketClient();

    if (user.profile_picture && user.profile_picture.startsWith("avatars/")) {
      try {
        await bucket.delete(user.profile_picture);
      } catch (error) {
        logger.error("Failed to delete old avatar", { error, userId: user_id });
      }
    }

    const timestamp = Date.now();
    const extension = path.extname(file.name) || ".png";
    const key = `avatars/${user_id}/${timestamp}${extension}`;

    await bucket.upload(key, file.buffer, file.type);
    await UsersRepository.update(user_id, { profile_picture: key });
    return bucket.getSignedUrl(key);
  }

  /**
   * Get linked OAuth providers from oauth_accounts table.
   */
  static async getProviders(user_id: string) {
    const rows = await UsersRepository.getOAuthAccounts(user_id);
    return {
      providers: rows.map((r) => r.provider),
      identities: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        provider_user_id: r.provider_user_id,
        email: r.provider_email,
      })),
    };
  }

  /**
   * Disconnect a provider by removing its oauth_accounts row.
   */
  static async disconnectProvider(user_id: string, provider: string) {
    await UsersRepository.deleteOAuthAccount(user_id, provider);
    const user = await UsersRepository.findById(user_id);
    if (!user) throw new Error("User not found");
    const remaining = await UsersRepository.getOAuthAccounts(user_id);
    await UsersRepository.update(user_id, {
      providers: remaining.map((r) => r.provider),
    });
  }
}
