import { Elysia } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildSuccess, buildError } from "@workspace/utils";
import { workspacesService } from "./workspaces.service";
import {
  CreateWorkspaceBody,
  CreateInvitationBody,
  InvitationParams,
} from "./workspaces.model";
import { authPlugin } from "../../plugins/auth";

/**
 * Workspaces controller — route definitions + validation + call service.
 * No DB access. No business logic.
 */
export const workspacesController = new Elysia({ prefix: "/workspaces" })
  .use(authPlugin)
  .post(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: Generic handler
    async ({ body, set, auth }: any) => {
      console.log("[WorkspacesController] Create workspace request received", {
        auth_user: auth,
        workspace_name: body.name,
      });

      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const workspace = await workspacesService.createWorkspace(
          auth.user_id,
          body,
        );
        set.status = 201;
        return buildSuccess(workspace, "Workspace created successfully");
      } catch (error: any) {
        console.error("Error creating workspace:", error);
        set.status = 500;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          `Failed to create workspace: ${error.message}`,
        );
      }
    },
    {
      body: CreateWorkspaceBody,
      detail: {
        summary: "Create Workspace",
        description:
          "Creates a new workspace and assigns the authenticated user as owner.",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: Generic handler
    async ({ set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const workspaces = await workspacesService.listWorkspaces(auth.user_id);
        return buildSuccess(workspaces, "Workspaces retrieved");
      } catch (_error) {
        set.status = 500;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          "Failed to list workspaces",
        );
      }
    },
    {
      detail: {
        summary: "List Workspaces",
        description:
          "Lists all workspaces the authenticated user is a member of.",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/active",
    async ({ set, auth }: any) => {
      if (!auth || !auth.workspace_id) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const workspace = await workspacesService.getActiveWorkspace(
          auth.workspace_id,
        );
        if (!workspace) {
          set.status = 404;
          return buildError(
            ErrorCode.WORKSPACE_NOT_FOUND,
            "Workspace not found",
          );
        }
        return buildSuccess(workspace, "Active workspace retrieved");
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Get Active Workspace",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/:id/members",
    async ({ set, auth, params }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
      try {
        const members = await workspacesService.getMembers(params.id);
        return buildSuccess(members, "Members retrieved");
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "List Members",
        tags: ["Workspaces"],
      },
    },
  )
  .post(
    "/:id/invitations",
    async ({ body, set, auth, params }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const invitation = await workspacesService.inviteMember(
          auth.user_id,
          params.id,
          body.email,
          body.role,
        );
        return buildSuccess(invitation, "Invitation sent successfully");
      } catch (error: any) {
        console.log(error);

        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      body: CreateInvitationBody,
      detail: {
        summary: "Invite Member",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/:id/invitations",
    async ({ set, auth, params }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        // ideally check if user is member of workspace first
        const invitations = await workspacesService.getInvitations(params.id);
        return buildSuccess(invitations, "Invitations retrieved");
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "List Invitations",
        tags: ["Workspaces"],
      },
    },
  )
  .delete(
    "/:id/invitations/:invitationId",
    async ({ set, auth, params }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        await workspacesService.cancelInvitation(
          auth.user_id,
          params.id,
          params.invitationId,
        );
        return buildSuccess(null, "Invitation cancelled");
      } catch (error: any) {
        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      params: InvitationParams,
      detail: {
        summary: "Cancel Invitation",
        tags: ["Workspaces"],
      },
    },
  )
  .post(
    "/invitations/accept",
    async ({ body, set, auth }: any) => {
      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const workspaceId = await workspacesService.acceptInvitationByToken(
          body.token,
          auth.user_id,
        );
        return buildSuccess(
          { workspaceId },
          "Invitation accepted successfully",
        );
      } catch (error: any) {
        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Accept Invitation",
        tags: ["Workspaces"],
      },
    },
  );
