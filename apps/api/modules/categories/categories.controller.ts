import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { ErrorCode } from "@workspace/types";
import { CategoriesService } from "./categories.service";
import { CategoryModel } from "./categories.model";
import { buildError } from "@workspace/utils";
import { status } from "elysia";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const categoriesController = new Elysia({
  prefix: "/categories",
  name: "categories.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .get(
    "/",
    async ({ query, auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      return CategoriesService.getCategories(
        auth.workspace_id,
        query.type as "income" | "expense" | undefined,
      );
    },
    {
      query: CategoryModel.listQuery,
      detail: {
        summary: "List Categories",
        description: "Returns all transaction categories for the workspace, optionally filtered by type (income/expense).",
        tags: ["Categories"],
      },
    },
  )
  .post(
    "/",
    async ({ body, auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return CategoriesService.createCategory(
        auth.workspace_id,
        auth.user_id,
        body,
      );
    },
    {
      body: CategoryModel.create,
      detail: {
        summary: "Create Category",
        description: "Creates a new transaction category.",
        tags: ["Categories"],
      },
    },
  )
  .patch(
    "/:id",
    async ({ params, body, auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return CategoriesService.updateCategory(
        auth.workspace_id,
        auth.user_id,
        params.id,
        body,
      );
    },
    {
      body: CategoryModel.update,
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Update Category",
        description: "Updates an existing category's name or color.",
        tags: ["Categories"],
      },
    },
  )
  .put(
    "/reorder",
    async ({ body, auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return CategoriesService.reorderCategories(
        auth.workspace_id,
        auth.user_id,
        body,
      );
    },
    {
      body: CategoryModel.reorder,
      detail: {
        summary: "Reorder Categories",
        description: "Updates the sorting order of multiple categories at once.",
        tags: ["Categories"],
      },
    },
  )
  .delete(
    "/:id",
    async ({ params, auth }) => {
      if (!auth?.workspace_id) {
        throw status(401, buildError(ErrorCode.UNAUTHORIZED, "Unauthorized"));
      }
      assertCanEditWorkspaceData(auth.workspace_role);
      return CategoriesService.deleteCategory(
        auth.workspace_id,
        auth.user_id,
        params.id,
      );
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Delete Category",
        description: "Soft-deletes a category. Transactions using this category will still exist but the category will be hidden.",
        tags: ["Categories"],
      },
    },
  );
