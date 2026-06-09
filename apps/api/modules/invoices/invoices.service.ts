import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildSuccess,
} from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsRepository } from "../audit-logs/audit-logs.repository";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { NotificationsService } from "../notifications/notifications.service";
import type { CreateInvoiceInput, UpdateInvoiceInput } from "./invoices.dto";
import { InvoicesRepository } from "./invoices.repository";

const INVOICE_TTL = 60 * 60 * 2; // 2h — invoices are rarely edited after creation
const invoiceKey = (workspaceId: string, id: string) =>
  `oewang:invoice:${workspaceId}:${id}`;
const invoicePublicKey = (workspaceId: string, id: string) =>
  `oewang:invoice:public:${workspaceId}:${id}`;

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
    const key = invoiceKey(workspaceId, id);
    const cached = await cacheGet<object>(key);
    if (cached) return buildSuccess(cached);

    const result = await InvoicesRepository.findById(id, workspaceId);

    if (!result) {
      return buildError(ErrorCode.NOT_FOUND, "Invoice not found");
    }

    await cacheSet(key, result, INVOICE_TTL);
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

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "invoice.created",
      entity: "invoice",
      entity_id: result.id,
      after: result,
    });

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "invoice.created",
      title: "Invoice Created",
      message: `Invoice #${(result as any).invoice_number || result.id.slice(0, 8)} has been created.`,
      link: "/invoices",
    }).catch(() => {});

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

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "invoice.updated",
      entity: "invoice",
      entity_id: id,
      before: before.invoice,
      after: result,
    });

    await cacheDel(
      invoiceKey(workspaceId, id),
      invoicePublicKey(workspaceId, id),
    );

    const prevStatus = (before.invoice as any)?.status;
    const newStatus = data.status;
    if (newStatus && newStatus !== prevStatus) {
      const statusMessages: Record<string, { title: string; message: string }> =
        {
          sent: {
            title: "Invoice Sent",
            message: `Invoice #${(result as any).invoice_number || id.slice(0, 8)} has been sent to the client.`,
          },
          paid: {
            title: "Invoice Paid",
            message: `Invoice #${(result as any).invoice_number || id.slice(0, 8)} has been marked as paid.`,
          },
          overdue: {
            title: "Invoice Overdue",
            message: `Invoice #${(result as any).invoice_number || id.slice(0, 8)} is now overdue.`,
          },
          canceled: {
            title: "Invoice Canceled",
            message: `Invoice #${(result as any).invoice_number || id.slice(0, 8)} has been canceled.`,
          },
        };
      const notif = statusMessages[newStatus];
      if (notif) {
        NotificationsService.create({
          workspace_id: workspaceId,
          user_id: userId,
          type: `invoice.${newStatus}`,
          title: notif.title,
          message: notif.message,
          link: `/invoices`,
        }).catch(() => {});
      }
    }

    return buildSuccess(result);
  }

  static async delete(id: string, workspaceId: string, userId: string) {
    const before = await InvoicesRepository.findById(id, workspaceId);
    await InvoicesRepository.softDelete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "invoice.deleted",
      entity: "invoice",
      entity_id: id,
      before: before?.invoice,
    });

    await cacheDel(
      invoiceKey(workspaceId, id),
      invoicePublicKey(workspaceId, id),
    );

    return buildSuccess(null);
  }

  static async getActivity(id: string, workspaceId: string) {
    const activity = await AuditLogsRepository.findByEntity(
      "invoice",
      id,
      workspaceId,
    );
    return buildSuccess(activity);
  }

  static async getPublicData(id: string, workspaceId: string) {
    const key = invoicePublicKey(workspaceId, id);
    type PublicData = NonNullable<
      Awaited<ReturnType<typeof InvoicesRepository.findPublicById>>
    >;
    const cached = await cacheGet<PublicData>(key);
    if (cached) return buildSuccess(cached);

    const result = await InvoicesRepository.findPublicById(id, workspaceId);

    if (!result) {
      return buildError(ErrorCode.NOT_FOUND, "Invoice not found");
    }

    await cacheSet(key, result, INVOICE_TTL);
    return buildSuccess(result);
  }
}
