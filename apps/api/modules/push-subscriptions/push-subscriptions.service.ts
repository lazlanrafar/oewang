import { buildSuccess } from "@workspace/utils";
import webpush from "web-push";
import { PushSubscriptionsRepository } from "./push-subscriptions.repository";

function getVapidKeys() {
  return {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  };
}

export abstract class PushSubscriptionsService {
  static getPublicKey() {
    return buildSuccess({ public_key: getVapidKeys().publicKey });
  }

  static async register(
    user_id: string,
    workspace_id: string,
    subscriptionJson: string,
  ) {
    let parsed: { endpoint: string };
    try {
      parsed = JSON.parse(subscriptionJson);
    } catch {
      throw new Error("Invalid subscription JSON");
    }

    await PushSubscriptionsRepository.upsert(
      user_id,
      workspace_id,
      parsed.endpoint,
      subscriptionJson,
    );
    return buildSuccess(null, "Push subscription registered");
  }

  static async unregister(user_id: string, endpoint: string) {
    await PushSubscriptionsRepository.deleteByEndpoint(user_id, endpoint);
    return buildSuccess(null, "Push subscription removed");
  }

  static async sendToUser(
    user_id: string,
    payload: { title: string; body: string; url?: string },
  ) {
    const subs = await PushSubscriptionsRepository.findByUserId(user_id);
    if (!subs.length) return;

    const { publicKey, privateKey, subject } = getVapidKeys();
    if (!publicKey || !privateKey) return;

    webpush.setVapidDetails(subject, publicKey, privateKey);

    await Promise.allSettled(
      subs.map((sub) =>
        webpush
          .sendNotification(
            JSON.parse(sub.subscription),
            JSON.stringify(payload),
          )
          .catch((err) => {
            // Remove expired subscriptions (410 Gone)
            if (err.statusCode === 410) {
              PushSubscriptionsRepository.deleteByEndpoint(
                user_id,
                sub.endpoint,
              );
            }
          }),
      ),
    );
  }
}
