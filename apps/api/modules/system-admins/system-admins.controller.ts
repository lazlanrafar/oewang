import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { SystemAdminModel } from "./system-admins.model";
import { SystemAdminsService } from "./system-admins.service";
import { ErrorCode } from "@workspace/types";

// Admin Guard Plugin
export const requireAdminAccess = new Elysia({ name: "guard.admin-access" })
  .use(authPlugin)
  .derive(({ auth, status }) => {
    if (!auth) {
      return status(401, { success: false, code: ErrorCode.UNAUTHORIZED });
    }
    if (auth.system_role !== "owner" && auth.system_role !== "finance") {
      return status(403, {
        success: false,
        code: ErrorCode.FORBIDDEN,
        message: "Owner or Finance access required.",
      });
    }
    return {}; // Passed validation
  });

export const systemAdminsController = new Elysia({ prefix: "/system-admins" })
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
    { query: SystemAdminModel.listQuery },
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
      body: t.Object({
        role: t.Union([
          t.Literal("owner"),
          t.Literal("finance"),
          t.Literal("user"),
        ]),
      }),
    },
  );
