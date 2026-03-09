"use server";

import type { ActionResponse, PaginationMeta } from "@workspace/types";

import { axiosInstance as api } from "../lib/axios.server";

export interface VaultFile {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  size: number;
  type: string;
  tags: string[];
  metadata: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedVaultFiles = {
  files: VaultFile[];
  pagination: PaginationMeta;
};

export const getVaultFiles = async (
  page = 1,
  limit = 20,
): Promise<ActionResponse<PaginatedVaultFiles>> => {
  try {
    const res = await api.get("/vault", {
      params: { page, limit },
    });
    return {
      success: true,
      data: {
        files: res.data.data,
        pagination: res.data.meta.pagination,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch vault files",
    };
  }
};

export const uploadVaultFile = async (
  formData: FormData,
): Promise<ActionResponse<VaultFile>> => {
  try {
    const res = await api.post("/vault/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Upload failed",
    };
  }
};

export const deleteVaultFile = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    const res = await api.delete(`/vault/${id}`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete file",
    };
  }
};

export const getVaultDownloadUrl = async (
  id: string,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const res = await api.get(`/vault/${id}/download`);
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to generate download URL",
    };
  }
};

export const updateVaultFileTags = async (
  id: string,
  tags: string[],
): Promise<ActionResponse<VaultFile>> => {
  try {
    const res = await api.patch(`/vault/${id}/tags`, { tags });
    return { success: true, data: res.data?.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update tags",
    };
  }
};
