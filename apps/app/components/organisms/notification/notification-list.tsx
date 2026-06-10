"use client";

import type { Dictionary } from "@workspace/dictionaries";
import { Button, cn } from "@workspace/ui";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle,
  CreditCard,
  FileText,
  HandCoins,
  Link2,
  Link2Off,
  PiggyBank,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { useNotifications } from "@/hooks/use-notifications";

export function NotificationList({ dictionary }: { dictionary: Dictionary }) {
  const { notifications, isLoading, markAsRead, deleteNotification, unreadCount } = useNotifications();
  const dict = dictionary.settings.notifications || {};

  const handleMarkAllAsRead = () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
      toast.success(dict.all_marked_read || "All notifications marked as read");
    }
  };

  const getIcon = (type: string) => {
    if (type.startsWith("transaction.")) return <TrendingUp className="size-4 text-blue-500" />;
    if (type === "budget.exceeded") return <AlertCircle className="size-4 text-red-500" />;
    if (type === "budget.created") return <PiggyBank className="size-4 text-emerald-500" />;
    if (type === "wallet.created") return <Wallet className="size-4 text-green-500" />;
    if (type.startsWith("debt.paid")) return <CheckCircle className="size-4 text-green-500" />;
    if (type.startsWith("debt.")) return <HandCoins className="size-4 text-yellow-500" />;
    if (type === "invoice.paid") return <CheckCircle className="size-4 text-green-500" />;
    if (type === "invoice.overdue") return <AlertCircle className="size-4 text-red-500" />;
    if (type.startsWith("invoice.")) return <FileText className="size-4 text-violet-500" />;
    if (type === "integration.connected") return <Link2 className="size-4 text-green-500" />;
    if (type === "integration.disconnected") return <Link2Off className="size-4 text-gray-500" />;
    if (type === "workspace.invitation_sent") return <Users className="size-4 text-blue-500" />;
    if (type === "workspace.member_joined") return <Users className="size-4 text-green-500" />;
    if (type === "workspace.joined") return <Users className="size-4 text-emerald-500" />;
    if (type === "subscription.activated") return <CreditCard className="size-4 text-green-500" />;
    if (type === "subscription.addon_purchased") return <CreditCard className="size-4 text-violet-500" />;
    if (type.startsWith("subscription.")) return <Receipt className="size-4 text-orange-500" />;
    return <Bell className="size-4 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex animate-pulse gap-4 rounded-lg border p-4">
            <div className="size-10 rounded-full bg-accent" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/4 rounded bg-accent" />
              <div className="h-3 w-3/4 rounded bg-accent" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent/50">
          <Bell className="size-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-sm">{dict.no_notifications || "No notifications"}</h3>
        <p className="mt-1 max-w-[200px] text-muted-foreground text-xs">
          {dict.no_notifications_description || "When you receive alerts, they will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">
          {dict.recent_activity || "Recent Activity"}
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-foreground px-1.5 py-0.5 font-bold text-[10px] text-background">
              {unreadCount}
            </span>
          )}
        </h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 font-semibold text-[10px] uppercase tracking-wider"
            onClick={handleMarkAllAsRead}
          >
            <CheckCheck className="mr-2 size-3" />
            {dict.mark_all_read || "Mark all as read"}
          </Button>
        )}
      </div>

      <div className="divide-y rounded-lg border bg-card">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={cn(
              "group relative flex gap-4 p-4 transition-colors hover:bg-accent/50",
              !notification.is_read && "bg-accent/20",
            )}
          >
            <div className="relative flex-none">
              <div className="flex size-10 items-center justify-center rounded-full border bg-background shadow-sm">
                {getIcon(notification.type)}
              </div>
              {!notification.is_read && (
                <span className="-right-0.5 -top-0.5 absolute size-2.5 rounded-full border-2 border-background bg-blue-600" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <span className={cn("truncate font-medium text-sm leading-none", !notification.is_read && "font-bold")}>
                  {notification.title}
                </span>
                <span className="flex-none text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.created_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <p className="line-clamp-2 text-muted-foreground text-xs">{notification.message}</p>

              <div className="flex items-center gap-2 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
                {!notification.is_read && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => markAsRead([notification.id])}
                  >
                    <Check className="mr-1 size-3" />
                    {dict.mark_read || "Mark read"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => deleteNotification(notification.id)}
                >
                  <Trash2 className="mr-1 size-3" />
                  {dict.delete || "Delete"}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {notifications.length >= 20 && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" className="h-8 font-semibold text-[10px] uppercase tracking-wider">
            {dict.load_more || "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
