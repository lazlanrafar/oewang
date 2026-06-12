import { ErrorCode } from "@workspace/types";
import { buildError, buildPaginatedSuccess } from "@workspace/utils";
import { status } from "elysia";
import { cacheDel, cacheGet, cacheSet } from "../../lib/cache";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { NotificationsService } from "../notifications/notifications.service";
import { RealtimeService } from "../realtime/realtime.service";
import { WalletGroupsRepository } from "./groups/groups.repository";
import { WalletsRepository } from "./wallets.repository";

const WALLET_GROUPS_TTL = 60 * 60 * 24; // 24h
const walletGroupsKey = (workspaceId: string) =>
  `oewang:wallets:groups:${workspaceId}`;

export abstract class WalletsService {
  // --- Wallet Groups ---

  static async getGroups(workspaceId: string) {
    const key = walletGroupsKey(workspaceId);
    const cached = await cacheGet<object[]>(key);
    if (cached) return cached;

    const groups = await WalletGroupsRepository.findMany(workspaceId);
    await cacheSet(key, groups, WALLET_GROUPS_TTL);
    return groups;
  }

  static async createGroup(
    workspaceId: string,
    userId: string,
    data: { name: string },
  ) {
    const group = await WalletGroupsRepository.create({
      workspaceId,
      ...data,
    });

    if (!group) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to create wallet group"),
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet_group.created",
      entity: "wallet_group",
      entity_id: group.id,
      after: group,
    });

    await cacheDel(walletGroupsKey(workspaceId));
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
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Wallet group not found"),
      );
    }
    const group = await WalletGroupsRepository.update(id, workspaceId, data);

    if (!group) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to update wallet group"),
      );
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

    await cacheDel(walletGroupsKey(workspaceId));
    RealtimeService.notifyValueChange(workspaceId, "wallets");

    return group;
  }

  static async deleteGroup(workspaceId: string, userId: string, id: string) {
    const before = await WalletGroupsRepository.findById(id, workspaceId);
    if (!before) {
      throw status(
        404,
        buildError(ErrorCode.NOT_FOUND, "Wallet group not found"),
      );
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

    await cacheDel(walletGroupsKey(workspaceId));
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

    await cacheDel(walletGroupsKey(workspaceId));
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
    filters?: {
      search?: string;
      groupId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const { rows, total } = await WalletsRepository.findMany(
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
      isDefault?: boolean;
    },
  ) {
    const balance = data.balance ? parseFloat(data.balance) : 0;
    const wallet = await WalletsRepository.create({
      workspaceId,
      ...data,
      balance,
      // The default flag is set explicitly via setDefault below to keep the
      // "only one default per workspace" invariant atomic.
      isDefault: false,
    });

    if (!wallet) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to create wallet"),
      );
    }

    if (data.isDefault) {
      await WalletsRepository.setDefault(workspaceId, wallet.id);
      wallet.isDefault = true;
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.created",
      entity: "wallet",
      entity_id: wallet.id,
      after: wallet,
    });

    NotificationsService.create({
      workspace_id: workspaceId,
      user_id: userId,
      type: "wallet.created",
      title: "Account Created",
      message: `"${wallet.name}" has been added to your accounts.`,
      link: "/accounts",
    }).catch(() => {});

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
      isDefault?: boolean;
      sortOrder?: number;
    },
  ) {
    const { isDefault, ...rest } = data;
    const updateData: any = { ...rest };
    if (rest.balance !== undefined) {
      updateData.balance = parseFloat(rest.balance);
    }

    const before = await WalletsRepository.findById(workspaceId, id);
    if (!before) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
    }
    const wallet = await WalletsRepository.update(id, workspaceId, updateData);

    if (!wallet) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to update wallet"),
      );
    }

    if (isDefault === true) {
      const updated = await WalletsRepository.setDefault(workspaceId, id);
      if (updated) wallet.isDefault = true;
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

  static async setDefaultWallet(
    workspaceId: string,
    userId: string,
    id: string,
  ) {
    const before = await WalletsRepository.findById(workspaceId, id);
    if (!before) {
      throw status(404, buildError(ErrorCode.NOT_FOUND, "Wallet not found"));
    }

    const wallet = await WalletsRepository.setDefault(workspaceId, id);
    if (!wallet) {
      throw status(
        500,
        buildError(ErrorCode.INTERNAL_ERROR, "Failed to set default wallet"),
      );
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: userId,
      action: "wallet.default_set",
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
