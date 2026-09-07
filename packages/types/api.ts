/**
 * Standard API response envelope.
 * All API responses MUST be wrapped in this type before encryption.
 */
export type ApiResponse<T> = {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
  meta: {
    timestamp: number;
    request_id?: string;
    pagination?: PaginationMeta;
    [key: string]: any;
  };
};

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
};

export type PaginatedList<T> = {
  rows: T[];
  total: number;
  meta: PaginationMeta;
};

export type PaginationQuery = {
  page?: number;
  limit?: number;
};

/**
 * Standard Server Action response shape.
 */
export type ActionResponse<T = unknown> =
  | { success: true; data: T; error?: never }
  | {
      success: false;
      error: string;
      data?: never;
      details?: { path: string; message: string }[];
    };
