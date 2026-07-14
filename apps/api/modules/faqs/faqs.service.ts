import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { CreateFaqInput, FaqListInput, UpdateFaqInput } from "./faqs.dto";
import { FaqsRepository } from "./faqs.repository";

const FAQ_PUBLIC_KEY = "oewang:faq:public";
const FAQ_PUBLIC_TTL = 60 * 60; // 1h

// Global marketing FAQ — not workspace-scoped. Admin mutations are audited under
// the acting admin's own workspace context (mirrors PricingService).
export abstract class FaqsService {
  static async getAll(query: FaqListInput) {
    const { rows, total } = await FaqsRepository.findAll(query);
    const limit = query.limit || 50;
    const page = query.page || 1;

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async getStats() {
    const stats = await FaqsRepository.getStats();
    return buildSuccess(stats);
  }

  static async getById(id: string) {
    const faq = await FaqsRepository.findById(id);
    if (!faq) {
      return buildError(ErrorCode.NOT_FOUND, "FAQ not found");
    }

    return buildSuccess(faq);
  }

  static async create(
    dto: CreateFaqInput,
    userId: string,
    workspaceId: string,
  ) {
    const faq = await FaqsRepository.create(dto);

    if (!faq) {
      return buildError(ErrorCode.INTERNAL_ERROR, "Failed to create FAQ");
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "faq.created",
      entity: "faq",
      entity_id: faq.id,
      after: faq,
    });

    await cacheDel(FAQ_PUBLIC_KEY);

    return buildSuccess(faq, "FAQ created successfully", "CREATED");
  }

  static async update(
    id: string,
    dto: UpdateFaqInput,
    userId: string,
    workspaceId: string,
  ) {
    const existing = await FaqsRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "FAQ not found");
    }

    const updated = await FaqsRepository.update(id, dto);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "faq.updated",
      entity: "faq",
      entity_id: id,
      before: existing,
      after: updated,
    });

    await cacheDel(FAQ_PUBLIC_KEY);

    return buildSuccess(updated);
  }

  static async softDelete(id: string, userId: string, workspaceId: string) {
    const existing = await FaqsRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "FAQ not found");
    }

    await FaqsRepository.softDelete(id);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "faq.deleted",
      entity: "faq",
      entity_id: id,
      before: existing,
    });

    await cacheDel(FAQ_PUBLIC_KEY);

    return buildSuccess(null);
  }

  static async getPublicFaqs() {
    const cached = await cacheGet<object[]>(FAQ_PUBLIC_KEY);
    if (cached) return buildSuccess(cached, "FAQs retrieved");

    const rows = await FaqsRepository.findPublicPublished();
    await cacheSet(FAQ_PUBLIC_KEY, rows, FAQ_PUBLIC_TTL);

    return buildSuccess(rows, "FAQs retrieved");
  }
}
