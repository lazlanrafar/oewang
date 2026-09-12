export type FeedbackSource = "website" | "native";
export type FeedbackType = "bug" | "feature_request" | "other";
export type FeedbackStatus =
  | "new"
  | "in_review"
  | "planned"
  | "resolved"
  | "rejected";

export interface Feedback {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  source: FeedbackSource;
  type: FeedbackType;
  message: string;
  screenshot_url: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  resolved_at: Date | string | null;
  reviewed_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

export interface CreateFeedbackInput {
  type: FeedbackType;
  message: string;
  name?: string;
  email?: string;
}

export interface UpdateFeedbackStatusInput {
  status: FeedbackStatus;
  admin_note?: string;
}

export type FeedbackStats = {
  total: number;
  new: number;
  in_review: number;
  planned: number;
  resolved: number;
  rejected: number;
};
