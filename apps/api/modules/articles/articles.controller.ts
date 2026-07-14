import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { requireAdminAccess } from "../system-admins/system-admins.controller";

import {
  ArticleListQuery,
  CreateArticleDto,
  UpdateArticleDto,
} from "./articles.dto";
import { ArticlesService } from "./articles.service";

export const articlesController = new Elysia({
  prefix: "/articles",
  name: "articles.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
  }))
  .get(
    "/",
    async ({ query }) => {
      return ArticlesService.getAll(query);
    },
    {
      query: ArticleListQuery,
      detail: { summary: "List Articles", tags: ["Articles"] },
    },
  )
  .get(
    "/stats",
    async () => {
      return ArticlesService.getStats();
    },
    { detail: { summary: "Get Article Stats", tags: ["Articles"] } },
  )
  .get(
    "/:id",
    async ({ params: { id } }) => {
      return ArticlesService.getById(id);
    },
    { detail: { summary: "Get Article Details", tags: ["Articles"] } },
  )
  .use(requireAdminAccess)
  .post(
    "/",
    async ({ body, auth, workspaceId }) => {
      return ArticlesService.create(
        body,
        auth?.user_id || "system",
        workspaceId!,
      );
    },
    {
      body: CreateArticleDto,
      detail: { summary: "Create Article", tags: ["Articles"] },
    },
  )
  .patch(
    "/:id",
    async ({ params: { id }, body, auth, workspaceId }) => {
      return ArticlesService.update(
        id,
        body,
        auth?.user_id || "system",
        workspaceId!,
      );
    },
    {
      body: UpdateArticleDto,
      detail: { summary: "Update Article", tags: ["Articles"] },
    },
  )
  .delete(
    "/:id",
    async ({ params: { id }, auth, workspaceId }) => {
      return ArticlesService.softDelete(
        id,
        auth?.user_id || "system",
        workspaceId!,
      );
    },
    { detail: { summary: "Delete Article", tags: ["Articles"] } },
  );
