import type {
  ActionResponse,
  ApiResponse,
  Article,
  ArticleStats,
  CreateArticleInput,
  PaginationMeta,
  UpdateArticleInput,
} from "@workspace/types";
import { axiosInstance as api } from "../lib/axios.server";

export const getArticles = async (params?: {
  page?: string;
  limit?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  published?: string;
}): Promise<
  ActionResponse<{
    articleList: Article[];
    meta: PaginationMeta;
  }>
> => {
  try {
    const response = await api.get("/articles", { params });
    const apiResponse = (response as any)._api_response as ApiResponse<
      Article[]
    >;

    const data: any = apiResponse?.data ?? response.data?.data;
    return {
      success: true,
      data: {
        articleList: Array.isArray(data) ? data : (data?.articleList ?? []),
        meta:
          apiResponse?.meta?.pagination ||
          response.data?.meta?.pagination ||
          ({} as PaginationMeta),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch articles",
    };
  }
};

export const getArticle = async (
  id: string,
): Promise<ActionResponse<Article>> => {
  try {
    const response = await api.get(`/articles/${id}`);
    const apiResponse = (response as any)._api_response as
      | ApiResponse<Article>
      | undefined;
    const data = apiResponse?.data ?? response.data?.data ?? null;
    if (!data) return { success: false, error: "Article not found" };
    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch article",
    };
  }
};

export const getArticleStats = async (): Promise<
  ActionResponse<ArticleStats>
> => {
  try {
    const response = await api.get("/articles/stats");
    const apiResponse = (response as any)._api_response as
      | ApiResponse<ArticleStats>
      | undefined;

    const data =
      apiResponse?.data ??
      (response.data as ApiResponse<ArticleStats>).data ??
      null;

    if (!data)
      return { success: false, error: "Failed to fetch article stats" };

    return { success: true, data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to fetch article stats",
    };
  }
};

export const createArticleAction = async (
  payload: CreateArticleInput,
): Promise<ActionResponse<Article>> => {
  try {
    const response = await api.post("/articles", payload);
    const apiResponse = (response as any)._api_response as ApiResponse<Article>;

    return { success: true, data: apiResponse?.data ?? response.data.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to create article",
    };
  }
};

export const updateArticleAction = async (
  id: string,
  payload: UpdateArticleInput,
): Promise<ActionResponse<Article>> => {
  try {
    const response = await api.patch(`/articles/${id}`, payload);
    const apiResponse = (response as any)._api_response as ApiResponse<Article>;

    return { success: true, data: apiResponse?.data ?? response.data.data };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to update article",
    };
  }
};

export const deleteArticleAction = async (
  id: string,
): Promise<ActionResponse<void>> => {
  try {
    await api.delete(`/articles/${id}`);
    return { success: true, data: undefined };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to delete article",
    };
  }
};

export const uploadArticleImageAction = async (
  formData: FormData,
): Promise<ActionResponse<{ url: string }>> => {
  try {
    const response = await api.post("/articles/upload-image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    const apiResponse = (response as any)._api_response as
      | ApiResponse<{ url: string }>
      | undefined;
    const url = apiResponse?.data?.url ?? response.data?.data?.url;
    if (!url) return { success: false, error: "Upload returned no URL" };
    return { success: true, data: { url } };
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.message || "Failed to upload image",
    };
  }
};
