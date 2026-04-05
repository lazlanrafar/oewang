import {
  buildSuccess,
  buildPaginatedSuccess,
  buildError,
  buildPagination,
} from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
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

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async getById(id: string) {
    const pricing = await PricingRepository.findById(id);
    if (!pricing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    return buildSuccess(pricing);
  }

  static async create(dto: CreatePricingInput, userId: string, workspaceId: string) {
    const p = await PricingRepository.create(dto);

    if (!p) {
        return buildError(ErrorCode.INTERNAL_ERROR, "Failed to create pricing plan");
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "pricing.created",
      entity: "pricing",
      entity_id: p.id,
      after: p,
    });

    return buildSuccess(
      p,
      "Pricing plan created successfully",
      "CREATED",
    );
  }

  static async update(id: string, dto: UpdatePricingInput, userId: string, workspaceId: string) {
    const existing = await PricingRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    const updated = await PricingRepository.update(id, dto);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "pricing.updated",
      entity: "pricing",
      entity_id: id,
      before: existing,
      after: updated,
    });

    return buildSuccess(updated);
  }

  static async softDelete(id: string, userId: string, workspaceId: string) {
    const existing = await PricingRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    await PricingRepository.softDelete(id);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "pricing.deleted",
      entity: "pricing",
      entity_id: id,
      before: existing,
    });

    return buildSuccess(null);
  }

  static async getPublicPlans() {
    const plans = await PricingRepository.findPublicActive();

    const formattedPlans = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      prices: plan.prices,
      features: plan.features,
      is_highlighted: plan.name.toLowerCase() === "pro",
      comingSoon: plan.name.toLowerCase() !== "starter",
    }));

    return buildSuccess(formattedPlans, "Pricing plans retrieved");
  }
}
