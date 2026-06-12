import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";
import { AuditLogsService } from "../../audit-logs/audit-logs.service";
import { RealtimeService } from "../../realtime/realtime.service";
import type { CreateSubCurrencyInput } from "./sub-currencies.model";
import { SubCurrenciesRepository } from "./sub-currencies.repository";

export abstract class SubCurrenciesService {
  static async list(workspaceId: string) {
    const subCurrencies =
      await SubCurrenciesRepository.findByWorkspaceId(workspaceId);
    return buildSuccess(subCurrencies, "Sub-currencies retrieved successfully");
  }

  static async create(
    workspaceId: string,
    userId: string,
    data: CreateSubCurrencyInput,
  ) {
    const existing =
      await SubCurrenciesRepository.findByWorkspaceId(workspaceId);
    if (existing.length >= 10) {
      throw status(
        422,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          "A maximum of 10 sub-currencies is allowed per workspace",
        ),
      );
    }

    const duplicate = await SubCurrenciesRepository.findByCurrencyCode(
      workspaceId,
      data.currencyCode,
    );
    if (duplicate) {
      throw status(
        409,
        buildError(ErrorCode.CONFLICT, "Currency code already exists"),
      );
    }

    const subCurrency = await SubCurrenciesRepository.create(workspaceId, data);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "sub_currency.created",
      entity: "workspace_sub_currencies",
      entity_id: subCurrency.id,
      after: subCurrency,
    });

    RealtimeService.notifyValueChange(workspaceId, "settings");

    return buildSuccess(
      subCurrency,
      "Sub-currency created successfully",
      "CREATED",
    );
  }

  static async delete(workspaceId: string, userId: string, id: string) {
    const existing = await SubCurrenciesRepository.findById(id, workspaceId);
    if (!existing) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Sub-currency not found"),
      );
    }

    await SubCurrenciesRepository.delete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "sub_currency.deleted",
      entity: "workspace_sub_currencies",
      entity_id: id,
      before: existing,
    });

    RealtimeService.notifyValueChange(workspaceId, "settings");

    return buildSuccess(null, "Sub-currency deleted successfully");
  }
}
