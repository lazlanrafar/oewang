import { UsersRepository } from "./users.repository";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { createClient } from "@workspace/supabase/server";
import { BucketClient } from "@workspace/bucket";
import { Env } from "@workspace/constants";
import * as fs from "node:fs";
import * as path from "node:path";
import { logger } from "@workspace/logger";

/**
 * Users service — business logic layer.
 * Handles workspace validation, calls repository.
 * No HTTP logic. No DB access.
 */
export abstract class UsersService {
  private static async getBucketClient() {
    if (
      !Env.R2_ENDPOINT ||
      !Env.R2_ACCESS_KEY_ID ||
      !Env.R2_SECRET_ACCESS_KEY ||
      !Env.R2_BUCKET_NAME
    ) {
      throw new Error("R2 storage not configured for avatars");
    }

    return new BucketClient({
      endpoint: Env.R2_ENDPOINT,
      accessKeyId: Env.R2_ACCESS_KEY_ID,
      secretAccessKey: Env.R2_SECRET_ACCESS_KEY,
      bucketName: Env.R2_BUCKET_NAME,
    });
  }

  /**
   * Sync a user from Supabase Auth to the internal database.
   * Returns workspace status.
   */
  static async syncUser(data: {
    id: string;
    email: string;
    name?: string | null;
    oauth_provider?: string | null;
    profile_picture?: string | null;
    providers?: string[] | null;
  }) {
    const log_file = path.join(process.cwd(), "debug-sync.log");
    try {
      // 1. Validate ID format (must be UUID)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(data.id)) {
        throw new Error(`Invalid UUID format for provider ID: ${data.id}`);
      }

      // Ensure providers is an array if provided
      const providers = Array.isArray(data.providers) ? data.providers : null;

      // 2. Upsert user
      await UsersRepository.upsert({
        id: data.id,
        email: data.email,
        name: data.name,
        oauth_provider: data.oauth_provider,
        profile_picture: data.profile_picture,
        providers: providers,
      });

      // 2. Check workspace membership
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

      // 3. Log action (only if workspace_id found)
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
      fs.appendFileSync(
        log_file,
        `[${new Date().toISOString()}] Sync Error: ${error.message}\nStack: ${error.stack}\nData: ${JSON.stringify(data)}\n\n`,
      );
      throw error;
    }
  }

  /**
   * Get current user profile with workspaces.
   */
  static async getProfile(user_id: string) {
    const user = await UsersRepository.findById(user_id);
    if (!user) return null;

    const workspaces = await UsersRepository.getWorkspacesWithRole(user_id);

    let profile_picture = user.profile_picture;
    if (profile_picture && profile_picture.startsWith("avatars/")) {
      try {
        const bucket = await this.getBucketClient();
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
      workspaces,
    };
  }

  /**
   * Update the user's active workspace.
   */
  static async updateActiveWorkspace(user_id: string, workspace_id: string) {
    // 1. Verify membership
    const memberships = await UsersRepository.getMemberships(user_id);
    const isMember = memberships.some((m) => m.workspace_id === workspace_id);

    if (!isMember) {
      throw new Error("User is not a member of this workspace");
    }

    // 2. Update active workspace
    await UsersRepository.setWorkspaceId(user_id, workspace_id);

    // 3. Log action
    await AuditLogsService.log({
      workspace_id,
      user_id,
      action: "user.workspace_switched",
      entity: "user",
      entity_id: user_id,
    });
  }

  /**
   * Update user profile.
   */
  static async updateProfile(
    user_id: string,
    data: { name?: string; profile_picture?: string | null; mobile?: string | null },
  ) {
    await UsersRepository.update(user_id, data);
  }

  /**
   * Update user avatar (photo profile).
   * Automatically deletes the old avatar from storage.
   */
  static async updateAvatar(user_id: string, file: { name: string; type: string; size: number; buffer: Buffer }) {
    const user = await UsersRepository.findById(user_id);
    if (!user) throw new Error("User not found");

    const bucket = await this.getBucketClient();

    // 1. Storage Cleanup: Delete old avatar if it exists and is an internal key
    if (user.profile_picture && user.profile_picture.startsWith("avatars/")) {
      try {
        await bucket.delete(user.profile_picture);
      } catch (error) {
        logger.error("Failed to delete old avatar", { error, userId: user_id });
        // Continue anyway, we don't want to block the new upload
      }
    }

    // 2. Upload new avatar
    const timestamp = Date.now();
    const extension = path.extname(file.name) || ".png";
    const key = `avatars/${user_id}/${timestamp}${extension}`;

    await bucket.upload(key, file.buffer, file.type);

    // 3. Update user record with the new key
    await UsersRepository.update(user_id, { profile_picture: key });

    // 4. Return the signed URL for immediate UI update
    return bucket.getSignedUrl(key);
  }

  /**
   * Get linked providers.
   */
  static async getProviders(user_id: string) {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.admin.getUserById(user_id);

    if (error || !user) {
      throw new Error(error?.message || "User not found in Supabase");
    }

    return {
      providers: user.app_metadata.providers || [],
      identities: user.identities || [],
    };
  }

  /**
   * Disconnect a provider.
   */
  static async disconnectProvider(user_id: string, provider: string) {
    const supabase = await createClient();

    // 1. Get user to find identity ID for this provider
    const {
      data: { user },
      error: getError,
    } = await supabase.auth.admin.getUserById(user_id);

    if (getError || !user) {
      throw new Error(getError?.message || "User not found");
    }

    const identity = user.identities?.find((i: any) => i.provider === provider);
    if (!identity) {
      throw new Error(`Provider ${provider} not linked`);
    }

    // 2. Unlink identity
    // Supabase admin SDK might not have "unlink" directly in all versions.
    // However, if we are on a version that supports it:
    if ("unlinkIdentity" in supabase.auth.admin) {
      // @ts-ignore
      const { error: unlinkErr } = await supabase.auth.admin.unlinkIdentity(
        identity.id,
      );
      if (unlinkErr) throw unlinkErr;
    } else {
      throw new Error("Unlink identity not supported by this SDK version");
    }

    // 3. Update internal providers list
    const updatedProviders =
      user.app_metadata.providers?.filter((p: string) => p !== provider) || [];
    await UsersRepository.update(user_id, { providers: updatedProviders });
  }
}
