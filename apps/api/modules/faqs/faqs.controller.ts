import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { requireAdminAccess } from "../system-admins/system-admins.controller";

import { CreateFaqDto, FaqListQuery, UpdateFaqDto } from "./faqs.dto";
import { FaqsService } from "./faqs.service";

export const faqsController = new Elysia({
  prefix: "/faqs",
  name: "faqs.controller",
})
  .use(authPlugin)
  .use(encryptionPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
  }))
  .get(
    "/",
    async ({ query }) => {
      return FaqsService.getAll(query);
    },
    {
      query: FaqListQuery,
      detail: { summary: "List FAQs", tags: ["FAQs"] },
    },
  )
  .get(
    "/stats",
    async () => {
      return FaqsService.getStats();
    },
    { detail: { summary: "Get FAQ Stats", tags: ["FAQs"] } },
  )
  .get(
    "/:id",
    async ({ params: { id } }) => {
      return FaqsService.getById(id);
    },
    { detail: { summary: "Get FAQ Details", tags: ["FAQs"] } },
  )
  .use(requireAdminAccess)
  .post(
    "/",
    async ({ body, auth, workspaceId }) => {
      return FaqsService.create(body, auth?.user_id || "system", workspaceId!);
    },
    {
      body: CreateFaqDto,
      detail: { summary: "Create FAQ", tags: ["FAQs"] },
    },
  )
  .patch(
    "/:id",
    async ({ params: { id }, body, auth, workspaceId }) => {
      return FaqsService.update(
        id,
        body,
        auth?.user_id || "system",
        workspaceId!,
      );
    },
    {
      body: UpdateFaqDto,
      detail: { summary: "Update FAQ", tags: ["FAQs"] },
    },
  )
  .delete(
    "/:id",
    async ({ params: { id }, auth, workspaceId }) => {
      return FaqsService.softDelete(
        id,
        auth?.user_id || "system",
        workspaceId!,
      );
    },
    { detail: { summary: "Delete FAQ", tags: ["FAQs"] } },
  );
