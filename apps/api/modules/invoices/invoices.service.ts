import {
  buildSuccess,
  buildPaginatedSuccess,
  buildError,
} from "@workspace/utils";
import { InvoicesRepository } from "./invoices.repository";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "./invoices.dto";
import { ErrorCode } from "@workspace/types";
import { auditLogsService } from "../audit-logs/audit-logs.service";
import { auditLogsRepository } from "../audit-logs/audit-logs.repository";

export abstract class InvoicesService {
  static async getAll(
    workspaceId: string,
    query: { page?: number; limit?: number; search?: string; status?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { data, total } = await InvoicesRepository.findAll(
      workspaceId,
      page,
      limit,
      query.search,
      query.status,
    );

    return buildPaginatedSuccess(data, {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  }

  static async getById(id: string, workspaceId: string) {
    const result = await InvoicesRepository.findById(id, workspaceId);

    if (!result) {
      return buildError(ErrorCode.NOT_FOUND, "Invoice not found");
    }

    return buildSuccess(result);
  }

  static async create(
    data: CreateInvoiceInput,
    workspaceId: string,
    userId: string,
  ) {
    const result = await InvoicesRepository.create({
      ...data,
      workspaceId,
    });

    if (!result) {
      throw new Error("Failed to create invoice");
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "invoice.created",
      entity: "invoice",
      entity_id: result.id,
      after: result,
    });

    return buildSuccess(result);
  }

  static async update(
    id: string,
    workspaceId: string,
    userId: string,
    data: UpdateInvoiceInput,
  ) {
    const before = await InvoicesRepository.findById(id, workspaceId);
    if (!before) {
      return buildError(ErrorCode.NOT_FOUND, "Invoice not found");
    }

    const result = await InvoicesRepository.update(id, workspaceId, data);

    if (!result) {
      throw new Error("Failed to update invoice");
    }

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "invoice.updated",
      entity: "invoice",
      entity_id: id,
      before: before.invoice,
      after: result,
    });

    return buildSuccess(result);
  }

  static async delete(id: string, workspaceId: string, userId: string) {
    const before = await InvoicesRepository.findById(id, workspaceId);
    await InvoicesRepository.softDelete(id, workspaceId);

    await auditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "invoice.deleted",
      entity: "invoice",
      entity_id: id,
      before: before?.invoice,
    });

    return buildSuccess(null);
  }

  static async getActivity(id: string, workspaceId: string) {
    const activity = await auditLogsRepository.findByEntity(
      "invoice",
      id,
      workspaceId,
    );
    return buildSuccess(activity);
  }

  static async getPublicData(id: string, workspaceId: string) {
    const result = await InvoicesRepository.findPublicById(id, workspaceId);

    if (!result) {
      return buildError(ErrorCode.NOT_FOUND, "Invoice not found");
    }

    return buildSuccess(result);
  }
}
