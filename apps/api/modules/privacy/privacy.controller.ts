import { Elysia } from "elysia";
import { authPlugin } from "../../plugins/auth";
import { encryptionPlugin } from "../../plugins/encryption";
import { buildError } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { PrivacyService } from "./privacy.service";
import {
  CreatePrivacyRequestBody,
  EraseDataBody,
  PrivacyRequestsQuery,
  RestrictProcessingBody,
  UpdatePrivacyRequestStatusBody,
} from "./privacy.model";
import { requireAdminAccess } from "../system-admins/system-admins.controller";
import { t } from "elysia";

export const privacyController = new Elysia({ prefix: "/privacy" })
  .use(authPlugin)
  .use(encryptionPlugin)
  .onBeforeHandle(({ auth, set }) => {
    if (!auth?.user_id) {
      set.status = 401;
      return buildError(ErrorCode.UNAUTHORIZED, "Unauthorized");
    }
  })
  .get(
    "/me/access",
    async ({ auth }) => {
      return PrivacyService.getAccessReport(auth!.user_id);
    },
    {
      detail: {
        summary: "Get Data Access Report",
        description:
          "Returns personal data currently associated with the authenticated user.",
        tags: ["Privacy"],
      },
    },
  )
  .get(
    "/me/export",
    async ({ auth }) => {
      return PrivacyService.exportPersonalData(auth!.user_id);
    },
    {
      detail: {
        summary: "Export Personal Data",
        description:
          "Returns a machine-readable personal data export package for the authenticated user.",
        tags: ["Privacy"],
      },
    },
  )
  .post(
    "/me/requests",
    async ({ auth, body }) => {
      return PrivacyService.submitRequest(
        auth!.user_id,
        body.requestType,
        body.reason,
      );
    },
    {
      body: CreatePrivacyRequestBody,
      detail: {
        summary: "Submit Privacy Request",
        description:
          "Submits a privacy request ticket for manual review and tracking.",
        tags: ["Privacy"],
      },
    },
  )
  .get(
    "/me/requests",
    async ({ auth, query }) => {
      return PrivacyService.listMyRequests(auth!.user_id, query);
    },
    {
      query: PrivacyRequestsQuery,
      detail: {
        summary: "List My Privacy Requests",
        description:
          "Returns privacy request history for the authenticated user.",
        tags: ["Privacy"],
      },
    },
  )
  .get(
    "/me/requests/:id",
    async ({ auth, params }) => {
      return PrivacyService.getRequestByIdForUser(auth!.user_id, params.id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get My Privacy Request",
        description:
          "Returns details of a single privacy request owned by the authenticated user.",
        tags: ["Privacy"],
      },
    },
  )
  .post(
    "/me/restrict",
    async ({ auth, body }) => {
      return PrivacyService.restrictProcessing(auth!.user_id, body.reason);
    },
    {
      body: RestrictProcessingBody,
      detail: {
        summary: "Restrict Processing",
        description:
          "Applies processing restriction by disabling user notification processing channels.",
        tags: ["Privacy"],
      },
    },
  )
  .post(
    "/me/erase",
    async ({ auth, body }) => {
      return PrivacyService.erasePersonalData(auth!.user_id, body.confirmation);
    },
    {
      body: EraseDataBody,
      detail: {
        summary: "Erase Personal Data",
        description:
          "Applies personal data erasure by anonymizing user identity and revoking active workspace memberships.",
        tags: ["Privacy"],
      },
    },
  )
  .use(requireAdminAccess)
  .get(
    "/requests",
    async ({ query }) => {
      return PrivacyService.listAllRequests(query);
    },
    {
      query: PrivacyRequestsQuery,
      detail: {
        summary: "List Privacy Requests (Admin)",
        description: "Lists privacy requests across users for administrators.",
        tags: ["Privacy Admin"],
      },
    },
  )
  .get(
    "/requests/:id",
    async ({ params }) => {
      return PrivacyService.getRequestByIdForAdmin(params.id);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        summary: "Get Privacy Request (Admin)",
        description: "Returns a privacy request by id for administrators.",
        tags: ["Privacy Admin"],
      },
    },
  )
  .patch(
    "/requests/:id/status",
    async ({ params, body, auth }) => {
      return PrivacyService.updateRequestStatus(
        params.id,
        auth!.user_id,
        body.status,
        body.note,
        body.closedReason,
      );
    },
    {
      params: t.Object({ id: t.String() }),
      body: UpdatePrivacyRequestStatusBody,
      detail: {
        summary: "Update Privacy Request Status (Admin)",
        description: "Updates privacy request lifecycle status for administrators.",
        tags: ["Privacy Admin"],
      },
    },
  );
