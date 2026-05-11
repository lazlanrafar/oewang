"use client";

import { useRouter } from "next/navigation";

import type { Notification } from "@workspace/database";
import { Badge, Button, cn, Popover, PopoverContent, PopoverTrigger, ScrollArea } from "@workspace/ui";
import { formatDistanceToNow } from "date-fns";
import { Bell, Trash2 } from "lucide-react";

import { useNotifications } from "@/hooks/use-notifications";
import type { AppDictionary } from "@/modules/types/dictionary";

export function NotificationBell({ dictionary }: { dictionary: AppDictionary }) {
  const { notifications, unreadCount, markAsRead, deleteNotification, isLoading } = useNotifications();
  const router = useRouter();

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length > 0) {
      markAsRead(unreadIds);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.is_read) {
      markAsRead([notification.id]);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 hover:bg-accent">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              className="-top-1 -right-1 absolute flex h-4 w-4 items-center justify-center bg-destructive p-0 text-[10px] text-destructive-foreground"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b p-4">
          <h4 className="font-semibold text-muted-foreground text-sm uppercase tracking-wider">
            {dictionary.notifications.title || "Notifications"}
          </h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-primary text-xs hover:bg-transparent"
              onClick={handleMarkAllRead}
            >
              {dictionary.notifications.mark_all_read || "Mark all as read"}
            </Button>
          )}
        </div>
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="flex h-full items-center justify-center p-4">
              <p className="text-muted-foreground text-xs">{dictionary.common.loading || "Loading..."}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-20" />
              <p className="font-medium text-sm">{dictionary.notifications.empty?.title || "No notifications yet"}</p>
              <p className="text-xs opacity-60">
                {dictionary.notifications.empty?.description || "We'll notify you when something happens."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 border-b p-4 transition-colors hover:bg-accent/50",
                    !n.is_read && "border-l-2 border-l-primary bg-accent/30",
                  )}
                  onClick={() => handleNotificationClick(n)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleNotificationClick(n);
                    }
                  }}
                  role="option"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-sm">{n.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(n.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                  <p className="line-clamp-2 text-muted-foreground text-xs">{n.message}</p>
                  <span className="mt-1 text-[10px] text-muted-foreground/60">
                    {formatDistanceToNow(new Date(n.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground text-xs hover:text-primary"
            onClick={() => router.push("/settings/notifications")}
          >
            {dictionary.notifications.view_settings || "View notification settings"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
