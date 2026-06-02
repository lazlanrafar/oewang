"use client";

import type { Dictionary } from "@workspace/dictionaries";
import { Label, Separator, Switch } from "@workspace/ui";
import { toast } from "sonner";

import { PushNotificationToggle } from "@/components/organisms/notification/push-notification-toggle";
import { useNotifications } from "@/hooks/use-notifications";

export function NotificationSettings({ dictionary }: { dictionary: Dictionary }) {
  const { settings, updateSettings, isLoading } = useNotifications();
  const dict = dictionary.settings.notifications || {};

  const handleToggle = (key: string, value: boolean) => {
    updateSettings({ [key]: value });
    toast.success(dict.preference_updated || "Notification preference updated");
  };

  if (isLoading || !settings) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="font-medium text-lg tracking-tight">{dict.title || "Notifications"}</h3>
          <p className="text-muted-foreground text-sm">
            {dict.description || "Manage how you receive alerts and updates."}
          </p>
        </div>
        <Separator />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <div className="h-4 w-32 animate-pulse rounded bg-accent" />
                <div className="mt-1 h-3 w-48 animate-pulse rounded bg-accent" />
              </div>
              <div className="h-6 w-10 animate-pulse rounded-full bg-accent" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-lg tracking-tight">{dict.title || "Notifications"}</h3>
        <p className="text-muted-foreground text-sm">
          {dict.description || "Manage how you receive alerts and updates across different channels."}
        </p>
      </div>

      <Separator />

      <div className="grid gap-6">
        <PushNotificationToggle
          enabled={settings?.push_enabled ?? false}
          onToggle={(value) => handleToggle("push_enabled", value)}
          dict={dict}
        />

        <div className="flex items-center justify-between space-x-2">
          <div className="space-y-0.5">
            <Label className="font-medium text-sm">{dict.email_notifications || "Email Notifications"}</Label>
            <p className="text-muted-foreground text-xs">
              {dict.email_description || "Get detailed updates and reports via email."}
            </p>
          </div>
          <Switch
            checked={settings?.email_enabled}
            onCheckedChange={(checked) => handleToggle("email_enabled", checked)}
          />
        </div>

        <div className="flex items-center justify-between space-x-2">
          <div className="space-y-0.5">
            <Label className="font-medium text-sm">{dict.whatsapp_notifications || "WhatsApp Notifications"}</Label>
            <p className="text-muted-foreground text-xs">
              {dict.whatsapp_description || "Receive quick alerts on your WhatsApp."}
            </p>
          </div>
          <Switch
            checked={settings?.whatsapp_enabled}
            onCheckedChange={(checked) => handleToggle("whatsapp_enabled", checked)}
          />
        </div>

        <div className="flex items-center justify-between space-x-2">
          <div className="space-y-0.5">
            <Label className="font-medium text-sm">{dict.marketing_comms || "Marketing Communications"}</Label>
            <p className="text-muted-foreground text-xs">
              {dict.marketing_description || "Receive news about new features and promotions."}
            </p>
          </div>
          <Switch
            checked={settings?.marketing_enabled}
            onCheckedChange={(checked) => handleToggle("marketing_enabled", checked)}
          />
        </div>
      </div>

      <div className="rounded-lg border bg-accent/20 p-4">
        <h4 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
          {dict.pro_tip || "Pro Tip"}
        </h4>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {dict.pro_tip_description ||
            "You can also configure specific alerts for budgets and large transactions in the Category settings."}
        </p>
      </div>
    </div>
  );
}
