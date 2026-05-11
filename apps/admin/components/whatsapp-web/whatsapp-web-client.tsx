"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  disconnectWhatsAppWebSessionAction,
  getWhatsAppWebStatusAction,
  startWhatsAppWebSessionAction,
} from "@workspace/modules/integrations/integrations.action";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui";
import {
  CheckCircle,
  Loader2,
  PhoneOff,
  QrCode,
  RefreshCw,
  Wifi,
  WifiOff,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

type SessionStatus =
  | "idle"
  | "starting"
  | "qr_ready"
  | "connected"
  | "disconnected"
  | "error";

interface SessionData {
  status: SessionStatus;
  qrCode?: string;
  phoneNumber?: string;
  connectedAt?: string;
  error?: string;
}

export function WhatsAppWebClient() {
  const [isStarting, setIsStarting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [session, setSession] = useState<SessionData>({ status: "idle" });
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch current status from the API
  const fetchStatus = useCallback(async () => {
    const result = await getWhatsAppWebStatusAction();
    if (result.success && result.data) {
      setSession(result.data as SessionData);
      return result.data as SessionData;
    }
    return null;
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Poll every 3 seconds while waiting for QR scan or connecting
  useEffect(() => {
    const shouldPoll =
      session.status === "starting" || session.status === "qr_ready";

    if (shouldPoll) {
      pollingRef.current = setInterval(async () => {
        const updated = await fetchStatus();
        if (updated?.status === "connected" || updated?.status === "error") {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }, 3000);
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [session.status, fetchStatus]);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const result = await startWhatsAppWebSessionAction();
      if (result.success && result.data) {
        setSession(result.data as SessionData);
        toast.success("Starting WhatsApp Web session...");
      } else {
        toast.error(result.error || "Failed to start session");
      }
    } finally {
      setIsStarting(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const result = await disconnectWhatsAppWebSessionAction();
      if (result.success) {
        setSession({ status: "idle" });
        toast.success("Disconnected WhatsApp session");
      } else {
        toast.error(result.error || "Failed to disconnect session");
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  const statusConfig: Record<
    SessionStatus,
    { label: string; color: string; icon: React.ReactNode }
  > = {
    idle: {
      label: "Not Connected",
      color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      icon: <WifiOff className="h-3.5 w-3.5" />,
    },
    starting: {
      label: "Starting…",
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    },
    qr_ready: {
      label: "Scan QR Code",
      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      icon: <QrCode className="h-3.5 w-3.5" />,
    },
    connected: {
      label: "Connected",
      color:
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      icon: <Wifi className="h-3.5 w-3.5" />,
    },
    disconnected: {
      label: "Disconnected",
      color: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
      icon: <WifiOff className="h-3.5 w-3.5" />,
    },
    error: {
      label: "Error",
      color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: <WifiOff className="h-3.5 w-3.5" />,
    },
  };

  const currentStatus = statusConfig[session.status] ?? statusConfig.idle;

  return (
    <div className="flex w-full flex-col p-6 space-y-6">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          WhatsApp Global Bot
        </h1>
        <p className="text-muted-foreground">
          Manage the global WhatsApp Web session for all workspaces.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/10">
              <Smartphone className="h-5 w-5 text-[#25D366]" />
            </div>
            <div>
              <CardTitle className="text-xl">Global Session Status</CardTitle>
              <CardDescription>
                Powered by whatsapp-web.js (Puppeteer)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${currentStatus.color}`}
              >
                {currentStatus.icon}
                {currentStatus.label}
              </span>
              {session.phoneNumber && (
                <span className="text-sm font-medium text-muted-foreground ml-2">
                  +{session.phoneNumber}
                </span>
              )}
            </div>

            {/* Main content area */}
            <div className="flex flex-col items-start gap-4">
              {/* ── IDLE / DISCONNECTED state ── */}
              {(session.status === "idle" ||
                session.status === "disconnected") && (
                <div className="w-full space-y-4">
                  <div className="rounded-xl border border-border/60 bg-secondary/20 p-5 text-sm text-muted-foreground">
                    <p className="mb-2 font-medium text-foreground">
                      How it works
                    </p>
                    <ol className="list-decimal space-y-1 pl-4">
                      <li>
                        Click <strong>Start Session</strong> below
                      </li>
                      <li>Wait for the Chromium browser to launch</li>
                      <li>
                        Scan the generated QR code with the admin WhatsApp app
                      </li>
                    </ol>
                  </div>
                  <Button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="bg-[#25D366] hover:bg-[#1fb558] text-white"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Starting session…
                      </>
                    ) : (
                      <>
                        <QrCode className="mr-2 h-4 w-4" />
                        Start Session
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* ── STARTING state ── */}
              {session.status === "starting" && (
                <div className="flex w-full flex-col items-center gap-4 py-4">
                  <div className="flex h-[200px] w-[200px] items-center justify-center border border-border/40 bg-secondary/20">
                    <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  </div>
                  <p className="text-center text-sm text-muted-foreground">
                    Launching WhatsApp Web Chromium instance… This may take
                    15–30 seconds.
                  </p>
                </div>
              )}

              {/* ── QR_READY state ── */}
              {session.status === "qr_ready" && (
                <div className="flex w-full flex-col items-center gap-4">
                  <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-white p-3 shadow-sm">
                    {session.qrCode ? (
                      // biome-ignore lint/performance/noImgElement: QR code is a generated data URI
                      <img
                        src={session.qrCode}
                        alt="WhatsApp QR Code"
                        className="h-[250px] w-[250px] rounded-lg"
                      />
                    ) : (
                      <div className="flex h-[250px] w-[250px] items-center justify-center rounded-lg bg-secondary/20">
                        <QrCode className="h-12 w-12 animate-pulse text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="max-w-[320px] text-center text-sm leading-relaxed text-muted-foreground">
                    Open WhatsApp on the <strong>admin phone</strong> → tap{" "}
                    <strong>⋮</strong> or <strong>Settings</strong> →{" "}
                    <strong>Linked Devices</strong> →{" "}
                    <strong>Link a Device</strong>, then scan this code.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchStatus}
                    className="gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh Status
                  </Button>
                </div>
              )}

              {/* ── CONNECTED state ── */}
              {session.status === "connected" && (
                <div className="w-full space-y-6">
                  <div className="flex items-center gap-4 py-2">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-lg text-foreground">
                        Global Bot Active
                      </p>
                      {session.connectedAt && (
                        <p className="text-sm text-muted-foreground">
                          Connected since{" "}
                          {new Date(session.connectedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-secondary/20 p-5 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">
                      Bot Operations
                    </p>
                    <ul className="space-y-1">
                      <li>
                        • End users can now send "Connect Oewang
                        &lt;workspaceId&gt;" to this number.
                      </li>
                      <li>
                        • The bot will process incoming messages across all
                        workspaces.
                      </li>
                      <li>
                        • Only one global session is needed for the entire
                        platform.
                      </li>
                    </ul>
                  </div>

                  <Button
                    variant="destructive"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="gap-2"
                  >
                    {isDisconnecting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Disconnecting…
                      </>
                    ) : (
                      <>
                        <PhoneOff className="h-4 w-4" />
                        Disconnect Bot
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* ── ERROR state ── */}
              {session.status === "error" && (
                <div className="w-full space-y-4">
                  <div className="rounded-xl border border-red-200/60 bg-red-50/50 p-4 dark:border-red-900/60 dark:bg-red-950/30">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                      Session Error
                    </p>
                    {session.error && (
                      <p className="mt-1 text-sm text-red-600/80 dark:text-red-500/80">
                        {session.error}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="bg-[#25D366] hover:bg-[#1fb558] text-white"
                  >
                    {isStarting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Retrying…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry Launch
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
