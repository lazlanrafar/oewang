import { createAdminClient } from "@workspace/supabase/admin";
import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildSuccess,
  buildPagination,
} from "@workspace/utils";
import { db, users } from "@workspace/database";
import { eq } from "drizzle-orm";
import { SystemAdminsRepository } from "./system-admins.repository";

export abstract class SystemAdminsService {
  static async getAllUsers(params: {
    page: number;
    limit: number;
    search?: string;
    system_role?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) {
    try {
      const { rows, total } = await SystemAdminsRepository.findAll(params);

      // Return Drizzle users only. We don't fetch the whole Supabase list anymore.
      // Drizzle now natively stores system_role.

      return buildPaginatedSuccess(
        rows,
        buildPagination(total, params.page, params.limit),
      );
    } catch (error: any) {
      console.error("Unhandled error fetching Drizzle users:", error);
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to fetch users");
    }
  }

  static async updateSystemRole(
    targetUserId: string,
    newRole: import("@workspace/constants").SystemRole,
  ) {
    // 1. Fetch user from database
    const [dbUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!dbUser) {
      return buildError(ErrorCode.NOT_FOUND, "User not found in database.");
    }

    // 2. Prevent demoting the root owner
    if (dbUser.email === "lazlanrafar@gmail.com" && newRole !== "owner") {
      return buildError(ErrorCode.FORBIDDEN, "Cannot demote the root owner.");
    }

    // 3. Update the database record
    await db
      .update(users)
      .set({ system_role: newRole })
      .where(eq(users.id, targetUserId));

    // 4. Try to sync to Supabase (graceful fail for local test users)
    const supabaseAdmin = createAdminClient();
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.getUserById(targetUserId);

    if (!authError && authData?.user) {
      const currentMetadata = authData.user.app_metadata || {};
      const { error: updateError } =
        await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
          app_metadata: { ...currentMetadata, system_role: newRole },
        });

      if (updateError) {
        console.warn(
          "Database updated, but failed to sync Supabase role:",
          updateError.message,
        );
      }
    }

    return buildSuccess(undefined);
  }
}
