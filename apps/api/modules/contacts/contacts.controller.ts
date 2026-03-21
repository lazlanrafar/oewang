import { Elysia, t } from "elysia";
import { ContactsService } from "./contacts.service";
import { ContactsModel } from "./contacts.model";
import { authPlugin } from "../../plugins/auth";
import { buildError, buildSuccess } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";

export const contactsController = new Elysia({ prefix: "/contacts" })
  .use(authPlugin)
  .derive(({ auth }) => ({
    workspaceId: auth?.workspace_id,
    userId: auth?.user_id,
  }))
  .onBeforeHandle(({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })

  // Get all contacts
  .get(
    "/",
    async ({ workspaceId, query }) => {
      const data = await ContactsService.getContacts(
        workspaceId!,
        query.search,
      );
      return data;
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
      }),
    },
  )
  
  // Get contact by ID
  .get(
    "/:id",
    async ({ workspaceId, params }) => {
      const data = await ContactsService.getContactById(
        workspaceId!,
        params.id,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
    },
  )
  .post(
    "/",
    async ({ workspaceId, userId, body, set }) => {
      const data = await ContactsService.createContact(
        workspaceId!,
        userId!,
        body,
      );
      set.status = 201;
      return data;
    },
    {
      body: ContactsModel.create,
    },
  )

  // Update a contact
  .patch(
    "/:id",
    async ({ workspaceId, userId, params, body }) => {
      const data = await ContactsService.updateContact(
        workspaceId!,
        userId!,
        params.id,
        body,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
      body: ContactsModel.update,
    },
  )

  // Delete a contact
  .delete(
    "/:id",
    async ({ workspaceId, userId, params }) => {
      const data = await ContactsService.deleteContact(
        workspaceId!,
        userId!,
        params.id,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );
