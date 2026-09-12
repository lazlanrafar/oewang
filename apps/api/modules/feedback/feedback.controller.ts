import { ErrorCode } from "@workspace/types";
import { buildError } from "@workspace/utils";
import { Elysia, t } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { requireAdminAccess } from "../system-admins/system-admins.controller";
import {
  CreateAuthedFeedbackBody,
  FeedbackListQuery,
  UpdateFeedbackStatusBody,
} from "./feedback.dto";
import { FeedbackService } from "./feedback.service";

export const feedbackController = new Elysia({ prefix: "/feedback" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .onBeforeHandle(({ auth, set }) => {
    if (!auth?.user_id) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .post(
    "/",
    async ({ auth, body }) => {
      const { file, ...dto } = body;
      const uploaded = file
        ? {
            name: file.name,
            type: file.type,
            buffer: Buffer.from(await file.arrayBuffer()),
          }
        : undefined;
      return FeedbackService.submitAuthed(dto, auth!.user_id, uploaded);
    },
    {
      body: CreateAuthedFeedbackBody,
      detail: { summary: "Submit Feedback", tags: ["Feedback"] },
    },
  )
  .use(requireAdminAccess)
  .get(
    "/",
    async ({ query }) => FeedbackService.getAll(query),
    {
      query: FeedbackListQuery,
      detail: { summary: "List Feedback (Admin)", tags: ["Feedback Admin"] },
    },
  )
  .get(
    "/stats",
    async () => FeedbackService.getStats(),
    {
      detail: {
        summary: "Get Feedback Stats (Admin)",
        tags: ["Feedback Admin"],
      },
    },
  )
  .get(
    "/:id",
    async ({ params }) => FeedbackService.getById(params.id),
    {
      params: t.Object({ id: t.String() }),
      detail: { summary: "Get Feedback (Admin)", tags: ["Feedback Admin"] },
    },
  )
  .patch(
    "/:id/status",
    async ({ params, body, auth }) =>
      FeedbackService.updateStatus(
        params.id,
        body,
        auth!.user_id,
        auth!.workspace_id,
      ),
    {
      params: t.Object({ id: t.String() }),
      body: UpdateFeedbackStatusBody,
      detail: {
        summary: "Update Feedback Status (Admin)",
        tags: ["Feedback Admin"],
      },
    },
  );
