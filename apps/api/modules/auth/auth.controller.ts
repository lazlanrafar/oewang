import { Elysia } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildSuccess, buildError } from "@workspace/utils";
import { generateJwt, authPlugin } from "../../plugins/auth";
import { workspacesService } from "../workspaces/workspaces.service";

/**
 * Auth controller — exchanges Supabase token for app JWT.
 * Route: POST /auth/token
 */
export const authController = new Elysia({ prefix: "/auth" })
  .use(authPlugin)
  .post(
    "/token",
    // biome-ignore lint/suspicious/noExplicitAny: Generic handler
    async ({ set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Invalid or expired token");
      }

      // If auth already has a workspace_id, generate JWT
      if (auth.workspace_id) {
        // Check for pending invitations and accept them (auto-join)
        // This handles cases where existing user is invited to another workspace
        if (auth.email) {
          await workspacesService.acceptInvitation(auth.email, auth.user_id);
        }

        const token = await generateJwt(
          auth.user_id,
          auth.workspace_id,
          auth.email,
          auth.system_role,
        );
        return buildSuccess(
          { token, user_id: auth.user_id, workspace_id: auth.workspace_id },
          "Token generated",
        );
      }

      // User has no workspace — try to find one via invitation
      let workspaceId = "";
      if (auth.email) {
        const acceptedWorkspaceId = await workspacesService.acceptInvitation(
          auth.email,
          auth.user_id,
        );
        if (acceptedWorkspaceId) {
          workspaceId = acceptedWorkspaceId;
        }
      }

      const email = auth.email || ""; // Should come from auth plugin now
      const token = await generateJwt(
        auth.user_id,
        workspaceId,
        email,
        auth.system_role,
      );
      return buildSuccess(
        { token, user_id: auth.user_id, workspace_id: workspaceId || null },
        "Token generated",
      );
    },
    {
      detail: {
        summary: "Exchange Token",
        description:
          "Exchanges a Supabase access token for an app JWT with user_id + workspace_id.",
        tags: ["Auth"],
      },
    },
  );
