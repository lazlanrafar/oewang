import { createId } from "@paralleldrive/cuid2";
import { BucketClient } from "@workspace/bucket";
import { Env } from "@workspace/constants";
import { createLogger } from "@workspace/logger";
import { ErrorCode } from "@workspace/types";
import {
  buildError,
  buildPaginatedSuccess,
  buildPagination,
  buildSuccess,
} from "@workspace/utils";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { NotificationsService } from "../notifications/notifications.service";
import type {
  CreateAuthedFeedbackInput,
  CreatePublicFeedbackInput,
  FeedbackListInput,
  UpdateFeedbackStatusInput,
} from "./feedback.dto";
import { FeedbackRepository } from "./feedback.repository";

const log = createLogger("feedback");

type UploadedFile = { name: string; type: string; buffer: Buffer };

export abstract class FeedbackService {
  // No workspace_id/user_id pair exists for an anonymous submission
  // (AuditLogsService.log requires both as non-optional strings), and a
  // native submission has a user but nothing meaningful to scope a
  // non-workspace entity to — feedback creation is deliberately not audited.
  // The admin status-change mutation below is (it has a real admin session).

  static async submitPublic(
    dto: CreatePublicFeedbackInput,
    file?: UploadedFile,
  ) {
    const screenshot_url = file
      ? await FeedbackService.uploadScreenshot(file)
      : null;

    const created = await FeedbackRepository.create({
      user_id: null,
      name: dto.name ?? null,
      email: dto.email,
      source: "website",
      type: dto.type,
      message: dto.message,
      screenshot_url,
    });

    await FeedbackService.notifyAdmins(created.id, dto.type, "website");

    return buildSuccess(created, "Feedback submitted");
  }

  static async submitAuthed(
    dto: CreateAuthedFeedbackInput,
    userId: string,
    file?: UploadedFile,
  ) {
    const source = dto.source ?? "native";
    const screenshot_url = file
      ? await FeedbackService.uploadScreenshot(file)
      : null;

    const created = await FeedbackRepository.create({
      user_id: userId,
      name: null,
      email: null,
      source,
      type: dto.type,
      message: dto.message,
      screenshot_url,
    });

    await FeedbackService.notifyAdmins(created.id, dto.type, source);

    return buildSuccess(created, "Feedback submitted");
  }

  // Best-effort: a bug report is still worth having without its screenshot,
  // so a missing/misconfigured bucket only drops the attachment, not the
  // whole submission.
  private static async uploadScreenshot(
    file: UploadedFile,
  ): Promise<string | null> {
    const endpoint = Env.BUCKET_ENDPOINT;
    const bucketName = Env.BUCKET_NAME;
    if (!endpoint || !Env.BUCKET_ACCESS_KEY_ID || !bucketName) {
      log.warn("Skipping feedback screenshot upload — bucket not configured");
      return null;
    }

    try {
      const bucket = new BucketClient({
        endpoint,
        accessKeyId: Env.BUCKET_ACCESS_KEY_ID,
        secretAccessKey: Env.BUCKET_SECRET_ACCESS_KEY ?? "",
        bucketName,
        region: Env.BUCKET_REGION,
      });

      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const key = `feedback/${createId()}.${ext}`;
      await bucket.upload(key, file.buffer, file.type);

      const base = Env.BUCKET_PUBLIC_URL
        ? Env.BUCKET_PUBLIC_URL.replace(/\/$/, "")
        : `${endpoint.replace(/\/$/, "")}/${bucketName}`;

      return `${base}/${key}`;
    } catch (error) {
      log.error("Feedback screenshot upload failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private static async notifyAdmins(
    feedbackId: string,
    type: string,
    source: "website" | "native" | "app",
  ) {
    let admins: Awaited<ReturnType<typeof FeedbackRepository.listAdminUserIds>>;
    try {
      admins = await FeedbackRepository.listAdminUserIds();
    } catch (error) {
      log.error("Failed to list admins for feedback notification", {
        feedbackId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const label = type === "feature_request" ? "Feature request" : "Bug report";

    await Promise.allSettled(
      admins.map(async (admin) => {
        if (!admin.workspace_id) {
          log.warn("Skipping feedback notification — admin has no workspace", {
            adminId: admin.id,
          });
          return;
        }
        await NotificationsService.create({
          workspace_id: admin.workspace_id,
          user_id: admin.id,
          type: "feedback.new",
          title: "New feedback received",
          message: `${label} via ${source}`,
          link: `/feedback/${feedbackId}`,
        });
      }),
    );
  }

  static async getAll(query: FeedbackListInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const { rows, total } = await FeedbackRepository.findAll(
      query,
      limit,
      offset,
    );

    return buildPaginatedSuccess(rows, buildPagination(total, page, limit));
  }

  static async getStats() {
    const stats = await FeedbackRepository.getStats();
    return buildSuccess(stats);
  }

  static async getById(id: string) {
    const row = await FeedbackRepository.findById(id);
    if (!row) {
      return buildError(ErrorCode.NOT_FOUND, "Feedback not found");
    }
    return buildSuccess(row);
  }

  static async updateStatus(
    id: string,
    dto: UpdateFeedbackStatusInput,
    adminUserId: string,
    workspaceId: string,
  ) {
    const existing = await FeedbackRepository.findById(id);
    if (!existing) {
      return buildError(ErrorCode.NOT_FOUND, "Feedback not found");
    }

    const now = new Date();
    const updated = await FeedbackRepository.updateStatus(id, {
      status: dto.status,
      admin_note: dto.admin_note ?? existing.admin_note ?? undefined,
      reviewed_by: adminUserId,
      resolved_at: dto.status === "resolved" ? now : null,
      updated_at: now,
    });

    if (!updated) {
      return buildError(ErrorCode.NOT_FOUND, "Feedback not found");
    }

    await AuditLogsService.log({
      workspace_id: workspaceId,
      user_id: adminUserId,
      action: "feedback.status_updated",
      entity: "feedback",
      entity_id: id,
      before: { status: existing.status },
      after: { status: updated.status, admin_note: updated.admin_note },
    });

    return buildSuccess(updated, "Feedback status updated");
  }
}
