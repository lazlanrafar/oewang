import { buildSuccess } from "@workspace/utils";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { DeviceTokensRepository } from "./device-tokens.repository";

// Lazy singleton — mirrors PushSubscriptionsService's getVapidKeys() pattern.
// The whole service-account JSON lives in one env var rather than a mounted
// file, matching how this repo keeps every other secret.
function messaging() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getMessaging();
}

export abstract class DeviceTokensService {
  static async register(
    user_id: string,
    workspace_id: string,
    token: string,
    platform: string,
  ) {
    await DeviceTokensRepository.upsert(user_id, workspace_id, token, platform);
    return buildSuccess(null, "Device token registered");
  }

  static async unregister(user_id: string, token: string) {
    await DeviceTokensRepository.deleteByToken(user_id, token);
    return buildSuccess(null, "Device token removed");
  }

  static async sendToUser(
    user_id: string,
    payload: { title: string; body: string; url?: string },
  ) {
    const tokens = await DeviceTokensRepository.findByUserId(user_id);
    if (!tokens.length) return;

    const fcm = messaging();
    if (!fcm) return;

    const res = await fcm.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
    });

    await Promise.allSettled(
      res.responses.map((r, i) =>
        // FCM's equivalent of web-push's 410 Gone — the token no longer exists.
        r.success ||
        r.error?.code !== "messaging/registration-token-not-registered"
          ? Promise.resolve()
          : DeviceTokensRepository.deleteByTokenValue(tokens[i]!.token),
      ),
    );
  }
}
