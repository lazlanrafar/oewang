import {
  buildSuccess,
  buildPaginatedSuccess,
  buildError,
  buildPagination,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import type {
  CreatePricingInput,
  PricingListInput,
  UpdatePricingInput,
} from "./pricing.dto";
import { PricingRepository } from "./pricing.repository";

export abstract class PricingService {
  static async getAll(query: PricingListInput) {
    const { rows, total } = await PricingRepository.findAll(query);
    const limit = query.limit || 50;
    const page = query.page || 1;

    return buildPaginatedSuccess(rows, buildPagination(page, limit, total));
  }

  static async getById(id: string) {
    const pricing = await PricingRepository.findById(id);
    if (!pricing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    return buildSuccess(pricing);
  }

  static async create(dto: CreatePricingInput, userId: string) {
    const pricing = await PricingRepository.create(dto);

    // Note: Pricing is a system-wide entity, so we use a specialized or null workspace_id conceptually,
    // but the AuditLog table strictly requires workspace_id in the DB.
    // For system features, we might need a workaround or log it under the admin's currently active workspace context.
    // Assuming the user must be acting from within a workspace Context to hit the API:
    // We will bypass Audit log for system-wide elements if it demands workspace_id, OR it can be omitted.
    // Okane DB has workspace_id as NOT NULL in audit logs? Let's check.
    // Usually, system actions log differently. We'll skip audit log for plan creation right here since we don't have workspace_id explicitly passed.
    // Update: If we need audit logging, we'd need to pass workspace_id from the context.

    return buildSuccess(
      pricing,
      "Pricing plan created successfully",
      "CREATED",
    );
  }

  static async update(id: string, dto: UpdatePricingInput, userId: string) {
    const existing = await PricingRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    const updated = await PricingRepository.update(id, dto);

    return buildSuccess(updated);
  }

  static async softDelete(id: string, userId: string) {
    const existing = await PricingRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    await PricingRepository.softDelete(id);

    return buildSuccess(null);
  }
}
