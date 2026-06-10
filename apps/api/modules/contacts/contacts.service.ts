import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildSuccess,
} from "@workspace/utils";
import { status } from "elysia";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { RealtimeService } from "../realtime/realtime.service";
import type { CreateContactInput, UpdateContactInput } from "./contacts.model";
import { ContactsRepository } from "./contacts.repository";

export abstract class ContactsService {
  static async createContact(
    workspaceId: string,
    userId: string,
    data: CreateContactInput,
  ) {
    const existing = await ContactsRepository.findByName(
      workspaceId,
      data.name,
    );
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

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "contact.created",
      entity: "contact",
      entity_id: contact.id,
      after: contact,
    });

    RealtimeService.notifyValueChange(workspaceId, "contacts");

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
      const existing = await ContactsRepository.findByName(
        workspaceId,
        data.name,
      );
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

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "contact.updated",
      entity: "contact",
      entity_id: id,
      before: contact,
      after: updated,
    });

    RealtimeService.notifyValueChange(workspaceId, "contacts");

    return buildSuccess(updated, "Contact updated successfully");
  }

  static async deleteContact(workspaceId: string, userId: string, id: string) {
    const contact = await ContactsRepository.findById(workspaceId, id);
    if (!contact) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Contact not found"));
    }

    await ContactsRepository.delete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "contact.deleted",
      entity: "contact",
      entity_id: id,
      before: contact,
    });

    RealtimeService.notifyValueChange(workspaceId, "contacts");

    return buildSuccess(null, "Contact deleted successfully");
  }

  static async getContacts(
    workspaceId: string,
    filters?: { search?: string; page?: number; limit?: number },
  ) {
    const { rows, total } = await ContactsRepository.findMany(
      workspaceId,
      filters,
    );
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    return buildPaginatedSuccess(
      rows,
      {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
      "Contacts retrieved successfully",
    );
  }

  static async getContactById(workspaceId: string, id: string) {
    const contact = await ContactsRepository.findById(workspaceId, id);
    if (!contact) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Contact not found"));
    }
    return buildSuccess(contact, "Contact retrieved successfully");
  }
}
