import { Elysia, t } from "elysia";
import { ContactsService } from "./contacts.service";
import { ContactsModel } from "./contacts.model";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildError, buildSuccess } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { assertCanEditWorkspaceData } from "../workspaces/workspace-permissions";

export const contactsController = new Elysia({ prefix: "/contacts" })
  .use(authPlugin)
  .use(encryptionPlugin)
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

  .get(
    "/",
    async ({ workspaceId, query }) => {
      const data = await ContactsService.getContacts(workspaceId!, query);
      return data;
    },
    {
      query: ContactsModel.listQuery,
      detail: {
        summary: "Get Contacts",
        description: "Returns a paginated list of contacts (debtors/creditors) for the active workspace.",
        tags: ["Contacts"],
      },
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
      detail: {
        summary: "Get Contact by ID",
        description: "Retrieves the full details and current balance for a specific contact.",
        tags: ["Contacts"],
      },
    },
  )
  .post(
    "/",
    async ({ auth, workspaceId, userId, body, set }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Create Contact",
        description: "Creates a new contact for tracking debts and transactions.",
        tags: ["Contacts"],
      },
    },
  )

  // Update a contact
  .patch(
    "/:id",
    async ({ auth, workspaceId, userId, params, body }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
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
      detail: {
        summary: "Update Contact",
        description: "Updates an existing contact's name, email, or phone number.",
        tags: ["Contacts"],
      },
    },
  )

  // Delete a contact
  .delete(
    "/:id",
    async ({ auth, workspaceId, userId, params }) => {
      assertCanEditWorkspaceData(auth?.workspace_role);
      const data = await ContactsService.deleteContact(
        workspaceId!,
        userId!,
        params.id,
      );
      return data;
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Delete Contact",
        description: "Soft-deletes a contact. Historical data linked to this contact is preserved but the contact is hidden.",
        tags: ["Contacts"],
      },
    },
  );
