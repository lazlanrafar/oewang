import { Elysia } from "elysia";
import { CreatePublicFeedbackBody } from "./feedback.dto";
import { FeedbackService } from "./feedback.service";

// Anonymous submission from the marketing website. No authPlugin — the
// browser has no session/JWT. Response encryption is exempted for this path
// (apps/api/plugins/encryption.ts) since the browser has no ENCRYPTION_KEY.
export const publicFeedbackController = new Elysia({
  prefix: "/public/feedback",
  name: "public-feedback.controller",
}).post(
  "/",
  async ({ body }) => {
    const { file, ...dto } = body;
    const uploaded = file
      ? {
          name: file.name,
          type: file.type,
          buffer: Buffer.from(await file.arrayBuffer()),
        }
      : undefined;
    return FeedbackService.submitPublic(dto, uploaded);
  },
  {
    body: CreatePublicFeedbackBody,
    detail: {
      summary: "Submit Feedback (Public)",
      description:
        "Anonymous feedback submission from the marketing website. No authentication required.",
      tags: ["Public"],
    },
  },
);
