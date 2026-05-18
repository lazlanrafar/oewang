import { axiosInstance as api } from "@workspace/modules/client";
import type { ApiResponse } from "@workspace/types";

export async function registerPushSubscription(subscriptionJson: string): Promise<void> {
  await api.post<ApiResponse<null>>("/push-subscriptions", {
    subscription: subscriptionJson,
  });
}

export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  await api.delete<ApiResponse<null>>("/push-subscriptions", {
    data: { endpoint },
  });
}
