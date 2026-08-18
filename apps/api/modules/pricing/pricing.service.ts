import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type {
  CreatePricingInput,
  PricingListInput,
  UpdatePricingInput,
} from "./pricing.dto";
import { PricingRepository } from "./pricing.repository";

const PRICING_PUBLIC_KEY = "oewang:pricing:public";
const PRICING_PUBLIC_TTL = 60 * 60; // 1h

export abstract class PricingService {
  static async getAll(query: PricingListInput) {
    const { rows, total } = await PricingRepository.findAll(query);
    const limit = query.limit || 50;
    const page = query.page || 1;

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async getStats() {
    const stats = await PricingRepository.getStats();
    return buildSuccess(stats);
  }

  static async getById(id: string) {
    const pricing = await PricingRepository.findById(id);
    if (!pricing) {
      return buildError(ErrorCode.NOT_FOUND, "Pricing plan not found");
    }

    return buildSuccess(pricing);
  }

  static async create(
    dto: CreatePricingInput,
    userId: string,
    workspaceId: string,
  ) {
    const p = await PricingRepository.create(dto);

    if (!p) {
      return buildError(
        ErrorCode.INTERNAL_ERROR,
        "Failed to create pricing plan",
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "pricing.created",
      entity: "pricing",
      entity_id: p.id,
      after: p,
    });

    await cacheDel(PRICING_PUBLIC_KEY);

    return buildSuccess(p, "Pricing plan created successfully", "CREATED");
  }

  static async update(
    id: string,
    dto: UpdatePricingInput,
    userId: string,
    workspaceId: string,
  ) {
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

    await cacheDel(PRICING_PUBLIC_KEY);

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

    await cacheDel(PRICING_PUBLIC_KEY);

    return buildSuccess(null);
  }

  static async getPublicPlans() {
    const cached = await cacheGet<object[]>(PRICING_PUBLIC_KEY);
    if (cached) return buildSuccess(cached, "Pricing plans retrieved");

    const plans = await PricingRepository.findPublicActive();

    const formattedPlans = plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      prices: plan.prices,
      features: plan.features,
      // Base plan vs add-on so consumers (e.g. the marketing site) can show
      // subscription tiers separately from AI/storage add-ons.
      is_addon: plan.is_addon,
      addon_type: plan.addon_type,
      is_highlighted: plan.name.toLowerCase() === "pro",
      comingSoon: plan.name.toLowerCase() !== "starter",
    }));

    await cacheSet(PRICING_PUBLIC_KEY, formattedPlans, PRICING_PUBLIC_TTL);

    return buildSuccess(formattedPlans, "Pricing plans retrieved");
  }
}
