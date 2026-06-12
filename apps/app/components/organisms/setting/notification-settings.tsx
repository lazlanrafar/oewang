"use client";

import type { Dictionary } from "@workspace/dictionaries";
import {
  Label,
  Separator,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { PushNotificationToggle } from "@/components/organisms/notification/push-notification-toggle";
import { useNotifications } from "@/hooks/use-notifications";

type CategoryKey =
  | "transactions_enabled"
  | "budgets_enabled"
  | "debts_enabled"
  | "invoices_enabled"
  | "wallets_enabled"
  | "workspace_enabled"
  | "inbox_enabled"
  | "ai_enabled";

export function NotificationSettings({ dictionary }: { dictionary: Dictionary }) {
  const { settings, updateSettings, isLoading } = useNotifications();
  const dict = (dictionary.settings.notifications || {}) as Record<string, string>;

  const handleToggle = (key: string, value: boolean) => {
    updateSettings({ [key]: value });
    toast.success(dict.preference_updated || "Notification preference updated");
  };

  const categories: { key: CategoryKey; label: string; description: string }[] = [
    {
      key: "transactions_enabled",
      label: dict.category_transactions || "Transactions",
      description:
        dict.category_transactions_description ||
        "Activity on income, expenses, transfers and receipt parsing.",
    },
    {
      key: "budgets_enabled",
      label: dict.category_budgets || "Budgets",
      description: dict.category_budgets_description || "Budget thresholds, overspend and resets.",
    },
    {
      key: "debts_enabled",
      label: dict.category_debts || "Debts & Splits",
      description:
        dict.category_debts_description || "Hutang, piutang, split-bill and payment reminders.",
    },
    {
      key: "invoices_enabled",
      label: dict.category_invoices || "Invoices",
      description: dict.category_invoices_description || "Sent, viewed and paid invoice events.",
    },
    {
      key: "wallets_enabled",
      label: dict.category_wallets || "Accounts",
      description: dict.category_wallets_description || "Wallet/account creation and balance alerts.",
    },
    {
      key: "workspace_enabled",
      label: dict.category_workspace || "Workspace",
      description:
        dict.category_workspace_description ||
        "Member invites, role changes, and other workspace activity.",
    },
    {
      key: "inbox_enabled",
      label: dict.category_inbox || "Inbox sync",
      description:
        dict.category_inbox_description || "Gmail/Outlook receipt-parsing results delivered to inbox.",
    },
    {
      key: "ai_enabled",
      label: dict.category_ai || "AI & Vault",
      description:
        dict.category_ai_description ||
        "AI token usage, vault uploads, and storage limit alerts.",
    },
  ];

  const mandatory: { label: string; description: string }[] = [
    {
      label: dict.category_billing || "Billing & Subscription",
      description:
        dict.category_billing_description ||
        "Charges, renewals and payment failures — required for account safety.",
    },
    {
      label: dict.category_integration || "Connected Apps",
      description:
        dict.category_integration_description ||
        "WhatsApp, Telegram and other integration connect / disconnect events.",
    },
    {
      label: dict.category_security || "Security",
      description:
        dict.category_security_description ||
        "Login alerts and security-sensitive workspace changes.",
    },
  ];

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

      <Separator />

      <div>
        <h4 className="font-medium text-sm">{dict.categories_title || "Notification Categories"}</h4>
        <p className="text-muted-foreground text-xs">
          {dict.categories_description ||
            "Choose which feature notifications appear in your bell. Mandatory categories cannot be disabled."}
        </p>
      </div>

      <div className="grid gap-6">
        {categories.map((c) => (
          <div key={c.key} className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label className="font-medium text-sm">{c.label}</Label>
              <p className="text-muted-foreground text-xs">{c.description}</p>
            </div>
            <Switch
              checked={(settings as unknown as Record<string, boolean | undefined>)?.[c.key] ?? true}
              onCheckedChange={(checked) => handleToggle(c.key, checked)}
            />
          </div>
        ))}

        {mandatory.map((c) => (
          <div key={c.label} className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-1.5 font-medium text-sm">
                {c.label}
                <span className="rounded-md border bg-muted/50 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                  {dict.mandatory_badge || "Required"}
                </span>
              </Label>
              <p className="text-muted-foreground text-xs">{c.description}</p>
            </div>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0} aria-label={dict.mandatory_tooltip || "This category cannot be disabled"}>
                    <Switch checked disabled className="cursor-not-allowed opacity-60" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    {dict.mandatory_tooltip || "This category cannot be disabled"}
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ))}
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
