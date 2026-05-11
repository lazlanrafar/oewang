import { Elysia, t } from "elysia";
import { ErrorCode } from "@workspace/types";
import { buildSuccess, buildError } from "@workspace/utils";
import { WorkspacesService } from "./workspaces.service";
import { OrdersService } from "../orders/orders.service";
import {
  CreateWorkspaceBody,
  CreateInvitationBody,
  InvitationParams,
} from "./workspaces.model";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { logger } from "@workspace/logger";
import { assertCanManageSensitiveWorkspace } from "./workspace-permissions";

/**
 * Workspaces controller — route definitions + validation + call service.
 * No DB access. No business logic.
 */
export const workspacesController = new Elysia({ prefix: "/workspaces" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .post(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: Generic handler
    async ({ body, set, auth }: any) => {
      logger.info("[WorkspacesController] Create workspace request received", {
        auth_user: auth,
        workspace_name: body.name,
      });

      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      try {
        const workspace = await WorkspacesService.createWorkspace(
          auth.user_id,
          body,
          auth.email,
        );
        set.status = 201;
        return buildSuccess(workspace, "Workspace created successfully");
      } catch (error: any) {
        logger.error("Error creating workspace", { error, userId: auth.user_id });

        // Handle errors thrown by service using status()
        if (error.status && error.body) {
          set.status = error.status;
          return error.body;
        }

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
        const workspaces = await WorkspacesService.listWorkspaces(auth.user_id);
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
        const workspace = await WorkspacesService.getActiveWorkspace(
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
        description: "Retrieves details of the currently active workspace.",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/members",
    async ({ set, auth }: any) => {
      if (!auth || !auth.workspace_id) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);
      try {
        const members = await WorkspacesService.getMembers(auth.workspace_id);
        return buildSuccess(members, "Members retrieved");
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "List Members",
        description: "Lists all members of the active workspace.",
        tags: ["Workspaces"],
      },
    },
  )
  .post(
    "/invitations",
    async ({ body, set, auth }: any) => {
      if (!auth || !auth.workspace_id) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      try {
        const invitation = await WorkspacesService.inviteMember(
          auth.user_id,
          auth.workspace_id,
          body.email,
          body.role,
        );
        return buildSuccess(invitation, "Invitation sent successfully");
      } catch (error: any) {
        logger.error("Error inviting member", { error, workspaceId: auth.workspace_id });

        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      body: CreateInvitationBody,
      detail: {
        summary: "Invite Member",
        description: "Invites a new member to the active workspace.",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/invitations",
    async ({ set, auth }: any) => {
      if (!auth || !auth.workspace_id) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      try {
        // ideally check if user is member of workspace first
        const invitations = await WorkspacesService.getInvitations(
          auth.workspace_id,
        );
        return buildSuccess(invitations, "Invitations retrieved");
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "List Invitations",
        description: "Lists all pending invitations for the active workspace.",
        tags: ["Workspaces"],
      },
    },
  )
  .delete(
    "/invitations/:invitationId",
    async ({ set, auth, params }: any) => {
      if (!auth || !auth.workspace_id) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      try {
        await WorkspacesService.cancelInvitation(
          auth.user_id,
          auth.workspace_id,
          params.invitationId,
        );
        return buildSuccess(null, "Invitation cancelled");
      } catch (error: any) {
        set.status = 400;
        return buildError(ErrorCode.VALIDATION_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Cancel Invitation",
        description: "Cancels a pending workspace invitation.",
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
        const workspaceId = await WorkspacesService.acceptInvitationByToken(
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
        description: "Accepts a workspace invitation using a token.",
        tags: ["Workspaces"],
      },
    },
  )
  .get(
    "/billing/history",
    async ({ auth, set }) => {
      if (!auth || !auth.workspace_id) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }
      assertCanManageSensitiveWorkspace(auth.workspace_role);

      try {
        return await OrdersService.getWorkspaceOrders(auth.workspace_id);
      } catch (error: any) {
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error.message);
      }
    },
    {
      detail: {
        summary: "Get Billing History",
        description: "Retrieves the billing/order history for the active workspace.",
        tags: ["Workspaces"],
      },
    },
  );
