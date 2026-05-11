import { WalletsRepository } from "./wallets.repository";
import { WalletGroupsRepository } from "./groups/groups.repository";
import { buildPaginatedSuccess, buildError } from "@workspace/utils";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { status } from "elysia";
import { ErrorCode } from "@workspace/types";
import { RealtimeService } from "../realtime/realtime.service";

export abstract class WalletsService {
  // --- Wallet Groups ---

  static async getGroups(workspaceId: string) {
    return WalletGroupsRepository.findMany(workspaceId);
  }

  static async createGroup(workspaceId: string, userId: string, data: { name: string }) {
    const group = await WalletGroupsRepository.create({
      workspaceId,
      ...data,
    });

    if (!group) {
        throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to create wallet group"));
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet_group.created",
      entity: "wallet_group",
      entity_id: group.id,
      after: group,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return group;
  }

  static async updateGroup(
    workspaceId: string,
    userId: string,
    id: string,
    data: { name?: string; sortOrder?: number },
  ) {
    const before = await WalletGroupsRepository.findById(id, workspaceId);
    if (!before) {
        throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet group not found"));
    }
    const group = await WalletGroupsRepository.update(id, workspaceId, data);

    if (!group) {
        throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to update wallet group"));
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet_group.updated",
      entity: "wallet_group",
      entity_id: id,
      before,
      after: group,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return group;
  }

  static async deleteGroup(workspaceId: string, userId: string, id: string) {
    const before = await WalletGroupsRepository.findById(id, workspaceId);
    if (!before) {
        throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet group not found"));
    }
    await WalletGroupsRepository.delete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet_group.deleted",
      entity: "wallet_group",
      entity_id: id,
      before,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return true;
  }

  static async reorderGroups(
    workspaceId: string,
    userId: string,
    updates: { id: string; sortOrder: number }[],
  ) {
    await WalletGroupsRepository.reorder(workspaceId, updates);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet_group.reordered",
      entity: "wallet_group",
      entity_id: "00000000-0000-0000-0000-000000000000",
      after: updates,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");
  }

  // --- Wallets ---
  
  static async getById(workspaceId: string, id: string) {
    const wallet = await WalletsRepository.findById(workspaceId, id);
    if (!wallet) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
    }
    return wallet;
  }

  static async getWallets(
    workspaceId: string,
    filters?: { search?: string; groupId?: string; page?: number; limit?: number },
  ) {
    const { rows, total } = await WalletsRepository.findMany(workspaceId, filters);
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
      "Wallets retrieved successfully",
    );
  }

  static async createWallet(
    workspaceId: string,
    userId: string,
    data: {
      name: string;
      groupId?: string | null;
      balance?: string;
      isIncludedInTotals?: boolean;
    },
  ) {
    const balance = data.balance ? parseFloat(data.balance) : 0;
    const wallet = await WalletsRepository.create({
      workspaceId,
      ...data,
      balance,
    });

    if (!wallet) {
        throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to create wallet"));
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.created",
      entity: "wallet",
      entity_id: wallet.id,
      after: wallet,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return wallet;
  }

  static async updateWallet(
    workspaceId: string,
    userId: string,
    id: string,
    data: {
      name?: string;
      groupId?: string | null;
      balance?: string;
      isIncludedInTotals?: boolean;
      sortOrder?: number;
    },
  ) {
    const updateData: any = { ...data };
    if (data.balance !== undefined) {
      updateData.balance = parseFloat(data.balance);
    }

    const before = await WalletsRepository.findById(workspaceId, id);
    if (!before) {
        throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
    }
    const wallet = await WalletsRepository.update(id, workspaceId, updateData);

    if (!wallet) {
        throw status(500, buildError(ErrorCode.INTERNAL_ERROR, "Failed to update wallet"));
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.updated",
      entity: "wallet",
      entity_id: id,
      before,
      after: wallet,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return wallet;
  }

  static async deleteWallet(workspaceId: string, userId: string, id: string) {
    const before = await WalletsRepository.findById(workspaceId, id);
    if (!before) {
        throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
    }
    await WalletsRepository.delete(id, workspaceId);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.deleted",
      entity: "wallet",
      entity_id: id,
      before,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return true;
  }

  static async reorderWallets(
    workspaceId: string,
    userId: string,
    updates: { id: string; sortOrder: number; groupId?: string | null }[],
  ) {
    await WalletsRepository.reorder(workspaceId, updates);

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.reordered",
      entity: "wallet",
      entity_id: "00000000-0000-0000-0000-000000000000",
      after: updates,
    });

    RealtimeService.notifyValueChange(workspaceId, "wallets");
  }
}
