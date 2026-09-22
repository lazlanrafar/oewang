import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import {
  SwitchWorkspaceBody,
  SyncUserBody,
  UpdateAvatarBody,
  UpdateProfileBody,
} from "./users.model";
import { UsersService } from "./users.service";
import { resolveWorkspaceIdFromBody } from "./users.utils";

/**
 * Users controller — route definitions + TypeBox validation + call service.
 * No DB access. No business logic.
 */
export const usersController = new Elysia({ prefix: "/users" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .post(
    "/sync",
    async ({ body, set, auth }) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      if (
        auth.user_id !== body.id &&
        auth.system_role !== "owner" &&
        auth.system_role !== "finance"
      ) {
        set.status = 403;
        return buildError(ErrorCode.FORBIDDEN, "Forbidden");
      }

      const result = await UsersService.syncUser(body);
      return buildSuccess(result, "User synced successfully");
    },
    {
      body: SyncUserBody,
      detail: {
        summary: "Sync User",
        description:
          "Syncs a user to the internal database. Returns workspace status.",
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

      const profile = await UsersService.getProfile(auth.user_id);

      if (!profile) {
        set.status = 404;
        return buildError(ErrorCode.USER_NOT_FOUND, "User not found");
      }

      return buildSuccess(profile, "User profile retrieved");
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
    async ({ body, set, auth }) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      const workspaceId = resolveWorkspaceIdFromBody(body);
      if (!workspaceId) {
        set.status = 400;
        return buildError(
          ErrorCode.VALIDATION_ERROR,
          "workspaceId is required",
        );
      }

      await UsersService.updateActiveWorkspace(auth.user_id, workspaceId);
      return buildSuccess(null, "Workspace switched successfully");
    },
    {
      body: SwitchWorkspaceBody,
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

      await UsersService.updateProfile(auth.user_id, body);
      return buildSuccess(null, "Profile updated successfully");
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

      const data = await UsersService.getProviders(auth.user_id);
      return buildSuccess(data, "Providers retrieved successfully");
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

      await UsersService.disconnectProvider(auth.user_id, provider);
      return buildSuccess(null, `Provider ${provider} disconnected`);
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

      const buffer = Buffer.from(await file.arrayBuffer());
      const url = await UsersService.updateAvatar(auth.user_id, {
        name: file.name,
        type: file.type,
        size: file.size,
        buffer,
      });

      return buildSuccess({ url }, "Profile picture updated successfully");
    },
    {
      body: UpdateAvatarBody,
      detail: {
        summary: "Update Profile Picture",
        description:
          "Uploads and automatically updates the authenticated user's profile picture. Deletes old avatar from storage.",
        tags: ["Users"],
      },
    },
  );
