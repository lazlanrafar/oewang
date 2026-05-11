import { Elysia, t } from "elysia";
import { requireAdminAccess } from "../../system-admins/system-admins.controller";
import { buildError, buildSuccess } from "@workspace/utils";
import { ErrorCode } from "@workspace/types";
import { WhatsAppWebService } from "./whatsapp-web.service";
import { createLogger } from "@workspace/logger";

const log = createLogger("whatsapp-web-controller");

export const whatsappWebController = new Elysia({ prefix: "/whatsapp-web" })
  .use(requireAdminAccess)
  /**
   * GET /v1/integrations/whatsapp-web/status
   */
  .get(
    "/status",
    async ({ set }) => {
      const sessionInfo = WhatsAppWebService.getSessionStatus();
      return buildSuccess(
        {
          status: sessionInfo.status,
          qrCode: sessionInfo.qrCode,
          phoneNumber: sessionInfo.phoneNumber,
          connectedAt: sessionInfo.connectedAt?.toISOString(),
          error: sessionInfo.error,
        },
        "WhatsApp Web session status retrieved",
      );
    },
    {
      detail: {
        summary: "WhatsApp Web Session Status",
        description: "Returns the current connection status for the global WhatsApp Web session.",
        tags: ["System Admins", "Integrations"],
      },
    },
  )
  /**
   * POST /v1/integrations/whatsapp-web/start
   */
  .post(
    "/start",
    async ({ set }) => {
      log.info(`[WA-Web] Starting global session from admin panel`);
      try {
        const sessionInfo = await WhatsAppWebService.startGlobalSession();
        log.info(`[WA-Web] Global session started successfully`, { status: sessionInfo.status });
 
        return buildSuccess(
          {
            status: sessionInfo.status,
            qrCode: sessionInfo.qrCode,
            phoneNumber: sessionInfo.phoneNumber,
            connectedAt: sessionInfo.connectedAt?.toISOString(),
            error: sessionInfo.error,
          },
          "WhatsApp Web global session started",
        );
      } catch (error: any) {
        log.error(`[WA-Web] Failed to start global session`, { error });
        set.status = 500;
        return buildError(ErrorCode.INTERNAL_ERROR, error?.message || "Failed to start WhatsApp Web session");
      }
    },
    {
      detail: {
        summary: "Start Global WhatsApp Web Session",
        description: "Initialises the global whatsapp-web.js Puppeteer client.",
        tags: ["System Admins", "Integrations"],
      },
    },
  )
  /**
   * POST /v1/integrations/whatsapp-web/disconnect
   */
  .post(
    "/disconnect",
    async ({ set }) => {
      await WhatsAppWebService.destroySession();
      return buildSuccess(null, "WhatsApp Web global session disconnected");
    },
    {
      detail: {
        summary: "Disconnect Global WhatsApp Web Session",
        description: "Logs out and destroys the global WhatsApp Web session.",
        tags: ["System Admins", "Integrations"],
      },
    },
  )
  /**
   * POST /v1/integrations/whatsapp-web/send
   */
  .post(
    "/send",
    async ({ body, set }) => {
      const sent = await WhatsAppWebService.sendMessage(
        body.to,
        body.message,
      );

      if (!sent) {
        set.status = 422;
        return buildError(
          ErrorCode.INTERNAL_ERROR,
          "WhatsApp Web session is not active. Start a session first.",
        );
      }

      return buildSuccess(null, "Message sent successfully");
    },
    {
      body: t.Object({
        to: t.String({ description: "International phone number (no '+')" }),
        message: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "Send Global WhatsApp Message",
        description: "Sends a text message using the global WhatsApp Web session.",
        tags: ["System Admins", "Integrations"],
      },
    },
  );
