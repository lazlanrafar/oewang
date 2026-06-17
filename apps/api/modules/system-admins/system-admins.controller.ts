import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { SystemAdminModel } from "./system-admins.model";
import { SystemAdminsService } from "./system-admins.service";

// Admin Guard Plugin
export const requireAdminAccess = new Elysia({ name: "guard.admin-access" })
  .use(authPlugin)
  .onBeforeHandle(({ auth, status }) => {
    if (!auth) {
      return status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
    }
    if (
      auth.system_role !== "superadmin" &&
      auth.system_role !== "owner" &&
      auth.system_role !== "finance"
    ) {
      return status(403, {
        success: false,
        code: ErrorCode.FORBIDDEN,
        message: "Superadmin access required.",
      });
    }
  });

export const systemAdminsController = new Elysia({ prefix: "/system-admins" })
  // authPlugin is name-deduped (already pulled in by requireAdminAccess); using
  // it directly here exposes `auth` to per-route beforeHandle for the
  // superadmin-only checks below.
  .use(authPlugin)
  .use(requireAdminAccess)
  .get(
    "/users",
    async ({ query }) => {
      const page = query.page ?? 1;
      const limit = query.limit ?? 50;

      const search = query.search;
      const system_role = query.system_role;
      const sortBy = query.sortBy;
      const sortOrder = query.sortOrder as "asc" | "desc" | undefined;

      const results = await SystemAdminsService.getAllUsers({
        page,
        limit,
        search,
        system_role,
        sortBy,
        sortOrder,
      });

      return results;
    },
    {
      query: SystemAdminModel.listQuery,
      detail: {
        summary: "List All Users",
        description:
          "Retrieves a paginated list of all users in the system. Restricted to system owners and finance administrators.",
        tags: ["System Admins"],
      },
    },
  )
  .patch(
    "/users/:id/role",
    async ({ params: { id }, body: { role }, set }) => {
      const result = await SystemAdminsService.updateSystemRole(id, role);
      if (!result.success) {
        set.status = result.code === ErrorCode.NOT_FOUND ? 404 : 400;
        if (result.code === ErrorCode.FORBIDDEN) set.status = 403;
      }
      return result;
    },
    {
      // Privilege escalation guard: only a superadmin may change system roles.
      // requireAdminAccess admits finance/owner for read routes, so this route
      // needs its own check or a finance user could self-promote to superadmin.
      beforeHandle({ auth, status }) {
        if (auth?.system_role !== "superadmin") {
          return status(
            403,
            buildError(ErrorCode.FORBIDDEN, "Superadmin access required."),
          );
        }
      },
      body: t.Object({
        role: t.Union([
          t.Literal("superadmin"),
          t.Literal("owner"),
          t.Literal("finance"),
          t.Literal("user"),
        ]),
      }),
      detail: {
        summary: "Update System Role",
        description:
          "Promotes or demotes a user's system-wide administrative role. Restricted to superadmins.",
        tags: ["System Admins"],
      },
    },
  )
  .get(
    "/workspaces",
    async ({ query }) => {
      const results = await SystemAdminsService.getAllWorkspaces({
        page: query.page ?? 1,
        limit: query.limit ?? 50,
        search: query.search,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder as "asc" | "desc" | undefined,
      });

      return results;
    },
    {
      query: SystemAdminModel.workspaceListQuery,
      detail: {
        summary: "List All Workspaces",
        description:
          "Retrieves a paginated list of all workspaces. Restricted to system owners and finance administrators.",
        tags: ["System Admins"],
      },
    },
  )
  .get(
    "/users/stats",
    async ({ query }) => {
      return SystemAdminsService.getUserStats({
        start: query.start,
        end: query.end,
      });
    },
    {
      query: t.Object({
        start: t.Optional(t.String()),
        end: t.Optional(t.String()),
      }),
      detail: {
        summary: "Get User Stats",
        description:
          "Returns aggregated counts (total, owners, finance, users) for all users.",
        tags: ["System Admins"],
      },
    },
  )
  .get(
    "/workspaces/stats",
    async () => {
      return SystemAdminsService.getWorkspaceStats();
    },
    {
      detail: {
        summary: "Get Workspace Stats",
        description:
          "Returns aggregated counts (total, active, paid, free) for all workspaces.",
        tags: ["System Admins"],
      },
    },
  )
  .get(
    "/plans",
    async () => {
      const results = await SystemAdminsService.getAllPlans();
      return results;
    },
    {
      detail: {
        summary: "List All Plans",
        description: "Retrieves all available pricing plans.",
        tags: ["System Admins"],
      },
    },
  )
  .patch(
    "/workspaces/:id/plan",
    async ({ params: { id }, body: { planId }, set }) => {
      const result = await SystemAdminsService.changeWorkspacePlan(id, planId);
      if (!result.success) {
        set.status = 400;
      }
      return result;
    },
    {
      // Superadmin-only: manually overriding a workspace's paid plan is a
      // billing-sensitive action and must not be reachable by finance/owner.
      beforeHandle({ auth, status }) {
        if (auth?.system_role !== "superadmin") {
          return status(
            403,
            buildError(ErrorCode.FORBIDDEN, "Superadmin access required."),
          );
        }
      },
      body: SystemAdminModel.updatePlanBody,
      detail: {
        summary: "Update Workspace Plan",
        description:
          "Manually updates a workspace's pricing plan. Restricted to superadmins.",
        tags: ["System Admins"],
      },
    },
  );
