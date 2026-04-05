import { Elysia } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildSuccess, buildError } from "@workspace/utils";
import { UsersService } from "./users.service";
import { SyncUserBody, UpdateAvatarBody, UpdateProfileBody } from "./users.model";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { logger } from "@workspace/logger";

/**
 * Users controller — route definitions + TypeBox validation + call service.
 * No DB access. No business logic.
 */
export const usersController = new Elysia({ prefix: "/users" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .post(
    "/sync",
    async ({ body, set }) => {
      try {
        const result = await UsersService.syncUser(body);
        return buildSuccess(result, "User synced successfully");
      } catch (error) {
        logger.error("Error in syncUser", { error, body });
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, "Failed to sync user");
      }
    },
    {
      body: SyncUserBody,
      detail: {
        summary: "Sync User",
        description:
          "Syncs a user from Supabase Auth to the internal database. Returns workspace status.",
        tags: ["Users"],
      },
    },
  )
  .get(
    "/me",
    // biome-ignore lint/suspicious/noExplicitAny: Generic handler
    async ({ set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const profile = await UsersService.getProfile(auth.user_id);

        if (!profile) {
          set.status = 404;
          return buildError(ErrorCode.USER_NOT_FOUND, "User not found");
        }

        return buildSuccess(profile, "User profile retrieved");
      } catch (_error) {
        set.status = 500;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          "Failed to get user profile",
        );
      }
    },
    {
      detail: {
        summary: "Get Current User",
        description: "Returns the authenticated user's profile and workspaces.",
        tags: ["Users"],
      },
    },
  )
  .patch(
    "/me/workspace",
    async ({ body, set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        await UsersService.updateActiveWorkspace(
          auth.user_id,
          body.workspace_id,
        );
        return buildSuccess(null, "Workspace switched successfully");
      } catch (error: any) {
        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Switch Active Workspace",
        description: "Updates the authenticated user's active workspace ID.",
        tags: ["Users"],
      },
    },
  )
  .patch(
    "/me",
    async ({ body, set, auth }) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        await UsersService.updateProfile(auth.user_id, body);
        return buildSuccess(null, "Profile updated successfully");
      } catch (error: any) {
        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      body: UpdateProfileBody,
      detail: {
        summary: "Update Profile",
        description: "Updates the authenticated user's profile information.",
        tags: ["Users"],
      },
    },
  )
  .get(
    "/me/providers",
    async ({ set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const data = await UsersService.getProviders(auth.user_id);
        return buildSuccess(data, "Providers retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Get Linked Providers",
        description: "Returns the list of linked authentication providers.",
        tags: ["Users"],
      },
    },
  )
  .delete(
    "/me/providers/:provider",
    async ({ params: { provider }, set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        await UsersService.disconnectProvider(auth.user_id, provider);
        return buildSuccess(null, `Provider ${provider} disconnected`);
      } catch (error: any) {
        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Disconnect Provider",
        description:
          "Unlinks an authentication provider from the user account.",
        tags: ["Users"],
      },
    },
  )
  .post(
    "/me/avatar",
    async ({ body: { file }, set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const url = await UsersService.updateAvatar(auth.user_id, {
          name: file.name,
          type: file.type,
          size: file.size,
          buffer,
        });

        return buildSuccess({ url }, "Profile picture updated successfully");
      } catch (error: any) {
        logger.error("Error in updateAvatar", { error, userId: auth.user_id });
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message || "Failed to update profile picture");
      }
    },
    {
      body: UpdateAvatarBody,
      detail: {
        summary: "Update Profile Picture",
        description: "Uploads and automatically updates the authenticated user's profile picture. Deletes old avatar from storage.",
        tags: ["Users"],
      },
    },
  );
