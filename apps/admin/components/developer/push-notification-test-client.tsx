"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@workspace/ui";
import { Bell, Send, CheckCircle2, XCircle } from "lucide-react";
import {
  getPushClientStatus,
  sendTestPush,
} from "@workspace/modules/push-notification/push-notification.action";

export function PushNotificationTestClient() {
  const [title, setTitle] = useState("Oewang Test Notification");
  const [body, setBody] = useState("Hello from Oewang Admin Developer Tools!");
  const [userId, setUserId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [clientStatus, setClientStatus] = useState<{
    deviceTokens: number;
    webPushSubscriptions: number;
  } | null>(null);

  const refreshStatus = async () => {
    const res = await getPushClientStatus(userId || undefined);
    if (res.success) setClientStatus(res.data);
  };

  useEffect(() => {
    refreshStatus();
    // biome-ignore lint/correctness/useExhaustiveDependencies: only on mount
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setStatus(null);

    const res = await sendTestPush({ userId: userId || undefined, title, body });
    setStatus(
      res.success
        ? { ok: true, message: "Test push dispatched." }
        : { ok: false, message: res.error },
    );
    setIsSending(false);
    await refreshStatus();
  };

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="font-semibold text-lg tracking-tight uppercase">Push Notifications Tester</h1>
        <p className="text-muted-foreground text-xs">
          Test and send push notifications to registered iOS, Android, and Web clients.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="border-b p-4">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <Bell className="size-4 text-primary" />
              Compose Test Notification
            </CardTitle>
            <CardDescription className="text-[11px]">
              Broadcast or target a specific user device.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSend} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userId" className="text-xs">Target User ID (Optional)</Label>
                <Input
                  id="userId"
                  placeholder="Leave empty to send to your own account"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  onBlur={refreshStatus}
                  className="rounded-none text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs">Notification Title</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="rounded-none text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body" className="text-xs">Notification Body</Label>
                <Textarea
                  id="body"
                  required
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="rounded-none text-xs"
                />
              </div>

              <Button type="submit" disabled={isSending} className="w-full rounded-none text-xs">
                <Send className="mr-2 size-4" />
                {isSending ? "Sending..." : "Send Test Push"}
              </Button>

              {status && (
                <div
                  className={`flex items-center gap-2 border p-3 text-xs ${
                    status.ok
                      ? "border-primary/20 bg-primary/10 text-primary"
                      : "border-destructive/20 bg-destructive/10 text-destructive"
                  }`}
                >
                  {status.ok ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <XCircle className="size-4" />
                  )}
                  {status.message}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-none border bg-background shadow-none">
          <CardHeader className="border-b p-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">Target Clients Status</CardTitle>
            <CardDescription className="text-[11px]">
              Registered devices for {userId || "your account"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4 text-xs">
            <div className="flex items-center justify-between border p-3">
              <div>
                <p className="font-medium">iOS / Android (FCM)</p>
                <p className="text-muted-foreground text-[10px]">
                  {clientStatus?.deviceTokens ?? 0} device token
                  {clientStatus?.deviceTokens === 1 ? "" : "s"} registered
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold ${
                  clientStatus && clientStatus.deviceTokens > 0
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {clientStatus && clientStatus.deviceTokens > 0 ? "Active" : "None"}
              </span>
            </div>

            <div className="flex items-center justify-between border p-3">
              <div>
                <p className="font-medium">Web Push (VAPID)</p>
                <p className="text-muted-foreground text-[10px]">
                  {clientStatus?.webPushSubscriptions ?? 0} subscription
                  {clientStatus?.webPushSubscriptions === 1 ? "" : "s"} registered
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-[10px] font-semibold ${
                  clientStatus && clientStatus.webPushSubscriptions > 0
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {clientStatus && clientStatus.webPushSubscriptions > 0 ? "Active" : "None"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
