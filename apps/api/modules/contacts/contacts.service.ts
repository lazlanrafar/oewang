import { ContactsRepository } from "./contacts.repository";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import { buildSuccess, buildError } from "@workspace/utils";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import type { CreateContactInput, UpdateContactInput } from "./contacts.model";

export abstract class ContactsService {
  static async createContact(
    workspaceId: string,
    userId: string,
    data: CreateContactInput,
  ) {
    const existing = await ContactsRepository.findByName(workspaceId, data.name);
    if (existing) {
      throw status(
        409,
        buildError(ErrorCode.CONFLICT, "Contact with this name already exists"),
      );
    }

    const contact = await ContactsRepository.create({
      workspaceId,
      ...data,
    });

    if (!contact) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to create contact"),
      );
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "contact.created",
      entity: "contact",
      entity_id: contact.id,
      after: contact,
    });

    return buildSuccess(contact, "Contact created successfully", "CREATED");
  }

  static async updateContact(
    workspaceId: string,
    userId: string,
    id: string,
    data: UpdateContactInput,
  ) {
    const contact = await ContactsRepository.findById(workspaceId, id);
    if (!contact) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Contact not found"));
    }

    if (data.name && data.name.toLowerCase() !== contact.name.toLowerCase()) {
      const existing = await ContactsRepository.findByName(workspaceId, data.name);
      if (existing) {
        throw status(
          409,
          buildError(
            ErrorCode.CONFLICT,
            "Another contact with this name already exists",
          ),
        );
      }
    }

    const updated = await ContactsRepository.update(id, workspaceId, data);

    if (!updated) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to update contact"),
      );
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "contact.updated",
      entity: "contact",
      entity_id: id,
      before: contact,
      after: updated,
    });

    return buildSuccess(updated, "Contact updated successfully");
  }

  static async deleteContact(workspaceId: string, userId: string, id: string) {
    const contact = await ContactsRepository.findById(workspaceId, id);
    if (!contact) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Contact not found"));
    }

    await ContactsRepository.delete(id, workspaceId);

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "contact.deleted",
      entity: "contact",
      entity_id: id,
      before: contact,
    });

    return buildSuccess(null, "Contact deleted successfully");
  }

  static async getContacts(workspaceId: string, search?: string) {
    const contacts = await ContactsRepository.findMany(workspaceId, search);
    return buildSuccess(contacts, "Contacts retrieved successfully");
  }

  static async getContactById(workspaceId: string, id: string) {
    const contact = await ContactsRepository.findById(workspaceId, id);
    if (!contact) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Contact not found"));
    }
    return buildSuccess(contact, "Contact retrieved successfully");
  }
}
