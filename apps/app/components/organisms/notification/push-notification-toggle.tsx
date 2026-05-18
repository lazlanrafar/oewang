"use client";

import { useEffect, useState } from "react";
import { Label, Switch } from "@workspace/ui";
import { toast } from "sonner";
import { registerPushSubscription, unregisterPushSubscription } from "@/actions/push-subscription.actions";

interface PushNotificationToggleProps {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  dict: Record<string, string>;
}

export function PushNotificationToggle({ enabled, onToggle, dict }: PushNotificationToggleProps) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
  }, []);

  const handleToggle = async (checked: boolean) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("Push notifications are not supported in this browser.");
      return;
    }

    if (checked) {
      if (Notification.permission === "denied") {
        toast.error("Push notifications are blocked. Please allow them in your browser settings.");
        return;
      }

      setIsRegistering(true);
      try {
        const perm = await Notification.requestPermission();
        setPermission(perm);

        if (perm !== "granted") {
          toast.error("Push notification permission was denied.");
          setIsRegistering(false);
          return;
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          toast.error("Push notifications are not configured.");
          setIsRegistering(false);
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey,
        });

        await registerPushSubscription(JSON.stringify(subscription));
        onToggle(true);
        toast.success("Push notifications enabled.");
      } catch (err) {
        toast.error("Failed to enable push notifications.");
        console.error("[Push] Registration error:", err);
      } finally {
        setIsRegistering(false);
      }
    } else {
      setIsRegistering(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await unregisterPushSubscription(subscription.endpoint);
        }
        onToggle(false);
        toast.success("Push notifications disabled.");
      } catch (err) {
        toast.error("Failed to disable push notifications.");
        console.error("[Push] Unsubscribe error:", err);
      } finally {
        setIsRegistering(false);
      }
    }
  };

  return (
    <div className="flex items-center justify-between space-x-2">
      <div className="space-y-0.5">
        <Label className="font-medium text-sm">{dict.push_notifications || "Push Notifications"}</Label>
        <p className="text-muted-foreground text-xs">
          {permission === "denied"
            ? "Blocked in browser settings — allow notifications to enable."
            : dict.push_description || "Receive real-time alerts in your browser."}
        </p>
      </div>
      <Switch
        checked={enabled && permission === "granted"}
        onCheckedChange={handleToggle}
        disabled={isRegistering || permission === "denied"}
      />
    </div>
  );
}

