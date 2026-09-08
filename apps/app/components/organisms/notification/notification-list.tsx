"use client";

import { useRouter } from "next/navigation";

import type { Dictionary } from "@workspace/dictionaries";
import type { Notification } from "@workspace/types";
import { Button, cn } from "@workspace/ui";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
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
  Loader2,
  PiggyBank,
  Receipt,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { useNotifications } from "@/hooks/use-notifications";

/** Today / Yesterday / a plain date — the same buckets as most inbox UIs. */
function groupLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

/** Buckets by [groupLabel], preserving the API's sort order (newest first). */
function groupByDate(notifications: Notification[]): [string, Notification[]][] {
  const groups = new Map<string, Notification[]>();
  for (const n of notifications) {
    const label = groupLabel(new Date(n.created_at));
    const bucket = groups.get(label);
    if (bucket) bucket.push(n);
    else groups.set(label, [n]);
  }
  return [...groups.entries()];
}

export function NotificationList({ dictionary }: { dictionary: Dictionary }) {
  const router = useRouter();
  const {
    notifications,
    isLoading,
    markAsRead,
    deleteNotification,
    unreadCount,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotifications();
  const dict = dictionary.settings.notifications || {};

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) markAsRead([notification.id]);
    if (notification.link) router.push(notification.link);
  };

  const handleMarkAllAsRead = () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
      toast.success(dict.all_marked_read || "All notifications marked as read");
    }
  };

  // Oewang only carries two semantic accent colors (green/red, per
  // STYLE_GUIDE.md's Color Tokens table) — everything else stays
  // text-muted-foreground instead of the rainbow of ad-hoc Tailwind colors
  // this used to reach for per notification type.
  const getIcon = (type: string) => {
    if (type === "budget.exceeded") return <AlertCircle className="size-4 text-red-500" />;
    if (type.startsWith("debt.paid")) return <CheckCircle className="size-4 text-emerald-500" />;
    if (type === "invoice.paid") return <CheckCircle className="size-4 text-emerald-500" />;
    if (type === "invoice.overdue") return <AlertCircle className="size-4 text-red-500" />;
    if (type === "subscription.activated") return <CreditCard className="size-4 text-emerald-500" />;
    if (type.startsWith("transaction.")) return <TrendingUp className="size-4 text-muted-foreground" />;
    if (type === "budget.created") return <PiggyBank className="size-4 text-muted-foreground" />;
    if (type === "wallet.created") return <Wallet className="size-4 text-muted-foreground" />;
    if (type.startsWith("debt.")) return <HandCoins className="size-4 text-muted-foreground" />;
    if (type.startsWith("invoice.")) return <FileText className="size-4 text-muted-foreground" />;
    if (type === "integration.connected") return <Link2 className="size-4 text-muted-foreground" />;
    if (type === "integration.disconnected") return <Link2Off className="size-4 text-muted-foreground" />;
    if (type.startsWith("workspace.")) return <Users className="size-4 text-muted-foreground" />;
    if (type === "subscription.addon_purchased") return <CreditCard className="size-4 text-muted-foreground" />;
    if (type.startsWith("subscription.")) return <Receipt className="size-4 text-muted-foreground" />;
    return <Bell className="size-4 text-muted-foreground" />;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex animate-pulse gap-4 border p-4">
            <div className="size-10 bg-accent" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/4 bg-accent" />
              <div className="h-3 w-3/4 bg-accent" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 flex size-12 items-center justify-center bg-accent/50">
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
            <span className="ml-2 bg-foreground px-1.5 py-0.5 font-bold text-[10px] text-background">
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

      {groupByDate(notifications).map(([label, group]) => (
        <div key={label} className="space-y-2">
          <h4 className="px-1 font-sans text-[11px] text-muted-foreground uppercase tracking-widest">{label}</h4>
          <div className="divide-y border bg-card">
            {group.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "group relative flex cursor-pointer gap-4 p-4 transition-colors hover:bg-accent/50",
                  !notification.is_read && "bg-accent/20",
                )}
                onClick={() => handleNotificationClick(notification)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleNotificationClick(notification);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="relative flex-none">
                  <div className="flex size-10 items-center justify-center border bg-background">
                    {getIcon(notification.type)}
                  </div>
                  {!notification.is_read && (
                    <span className="-right-0.5 -top-0.5 absolute size-2.5 border-2 border-background bg-primary" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn("truncate text-xs leading-none", !notification.is_read ? "font-bold" : "font-medium")}
                    >
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
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead([notification.id]);
                        }}
                      >
                        <Check className="mr-1 size-3" />
                        {dict.mark_read || "Mark read"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                    >
                      <Trash2 className="mr-1 size-3" />
                      {dict.delete || "Delete"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 font-semibold text-[10px] uppercase tracking-wider"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage && <Loader2 className="mr-2 size-3 animate-spin" />}
            {dict.load_more || "Load More"}
          </Button>
        </div>
      )}
    </div>
  );
}
