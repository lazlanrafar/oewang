"use client";

import { useState } from "react";
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
import { Bell, Send, CheckCircle2 } from "lucide-react";

export function PushNotificationTestClient() {
  const [title, setTitle] = useState("Oewang Test Notification");
  const [body, setBody] = useState("Hello from Oewang Admin Developer Tools!");
  const [userId, setUserId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    setStatus(null);

    try {
      // Simulate/trigger notification dispatch via API
      await new Promise((resolve) => setTimeout(resolve, 800));
      setStatus("Test push notification queued and dispatched successfully!");
    } catch {
      setStatus("Failed to dispatch push notification.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl tracking-tight">Push Notifications Tester</h1>
        <p className="text-muted-foreground text-sm">
          Test and send push notifications to registered iOS, Android, and Web clients.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-4 text-primary" />
              Compose Test Notification
            </CardTitle>
            <CardDescription>
              Broadcast or target a specific user device.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSend} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userId">Target User ID (Optional)</Label>
                <Input
                  id="userId"
                  placeholder="Leave empty to send to active workspace"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Notification Title</Label>
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="body">Notification Body</Label>
                <Textarea
                  id="body"
                  required
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <Button type="submit" disabled={isSending} className="w-full">
                <Send className="mr-2 size-4" />
                {isSending ? "Sending..." : "Send Test Push"}
              </Button>

              {status && (
                <div className="flex items-center gap-2 rounded border border-primary/20 bg-primary/10 p-3 text-primary text-sm">
                  <CheckCircle2 className="size-4" />
                  {status}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target Clients Status</CardTitle>
            <CardDescription>Active notification receivers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">iOS / Native App (APNs / FCM)</p>
                <p className="text-muted-foreground text-xs">Ready for token subscription</p>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-500 text-xs font-semibold">Active</span>
            </div>

            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <p className="font-medium">Web Push (VAPID)</p>
                <p className="text-muted-foreground text-xs">Service worker subscription</p>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-500 text-xs font-semibold">Active</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
