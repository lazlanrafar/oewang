import { createLogger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { OrdersService } from "../orders/orders.service";
import { assertCanManageSensitiveWorkspace } from "./workspace-permissions";
import {
  CreateInvitationBody,
  CreateWorkspaceBody,
  InvitationParams,
} from "./workspaces.model";
import { WorkspacesService } from "./workspaces.service";

const log = createLogger("workspaces.controller");

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
      log.info("Create workspace request received", {
        userId: auth?.user_id,
        workspace_name: body.name,
      });

      if (!auth) {
        set.status = 401;
        return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
      }

      const workspace = await WorkspacesService.createWorkspace(
        auth.user_id,
        body,
        auth.email,
      );
      set.status = 201;
      return buildSuccess(workspace, "Workspace created successfully");
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

      const workspaces = await WorkspacesService.listWorkspaces(auth.user_id);
      return buildSuccess(workspaces, "Workspaces retrieved");
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

      const workspace = await WorkspacesService.getActiveWorkspace(
        auth.workspace_id,
      );
      if (!workspace) {
        set.status = 404;
        return buildError(ErrorCode.WORKSPACE_NOT_FOUND, "Workspace not found");
      }
      return buildSuccess(workspace, "Active workspace retrieved");
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
      const members = await WorkspacesService.getMembers(auth.workspace_id);
      return buildSuccess(members, "Members retrieved");
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

      const invitation = await WorkspacesService.inviteMember(
        auth.user_id,
        auth.workspace_id,
        body.email,
        body.role,
      );
      return buildSuccess(invitation, "Invitation sent successfully");
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

      // ideally check if user is member of workspace first
      const invitations = await WorkspacesService.getInvitations(
        auth.workspace_id,
      );
      return buildSuccess(invitations, "Invitations retrieved");
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

      await WorkspacesService.cancelInvitation(
        auth.user_id,
        auth.workspace_id,
        params.invitationId,
      );
      return buildSuccess(null, "Invitation cancelled");
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

      const workspaceId = await WorkspacesService.acceptInvitationByToken(
        body.token,
        auth.user_id,
      );
      return buildSuccess({ workspaceId }, "Invitation accepted successfully");
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

      return await OrdersService.getWorkspaceOrders(auth.workspace_id);
    },
    {
      detail: {
        summary: "Get Billing History",
        description:
          "Retrieves the billing/order history for the active workspace.",
        tags: ["Workspaces"],
      },
    },
  );
