"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Icons,
} from "@workspace/ui";
import { Check, Copy, QrCode } from "lucide-react";
import * as QRCode from "qrcode";
import { useQuery } from "@tanstack/react-query";
import { getMe } from "@workspace/modules/user/user.action";
import { Env } from "@workspace/constants";

export function ConnectTelegram() {
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      return result.success ? result.data : null;
    },
  });

  const workspaceId = me?.user.workspace_id;
  const userId = me?.user.id;
  const botUsername = Env.NEXT_PUBLIC_TELEGRAM_BOT_USER || "OewangBot";
  const telegramUrl = workspaceId && userId
    ? `https://t.me/${botUsername}?start=${workspaceId}___${userId}`
    : `https://t.me/${botUsername}`;

  useEffect(() => {
    if (open && workspaceId && botUsername) {
      generateQRCode();
    }
  }, [open, workspaceId, botUsername]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("openTelegramConnect", handleOpen);
    return () => window.removeEventListener("openTelegramConnect", handleOpen);
  }, []);

  const generateQRCode = async () => {
    if (!workspaceId) return;
    try {
      const url = await QRCode.toDataURL(telegramUrl, {
        width: 250,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      });
      setQrCodeUrl(url);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(telegramUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-background">
        <div className="p-8">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-tight">
              Connect Telegram
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2">
              Scan the QR code or open Telegram to connect your account to
              Oewang.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col items-center space-y-6 px-8">
          <div className="relative group">
            <div className="relative bg-white p-3 border">
              {!isLoading && workspaceId && qrCodeUrl ? (
                <img
                  src={qrCodeUrl}
                  alt="Telegram QR Code"
                  className="w-[200px] h-[200px]"
                />
              ) : (
                <div className="flex items-center justify-center w-[200px] h-[200px] bg-secondary/30 rounded-md">
                  <QrCode className="h-12 w-12 text-muted-foreground animate-pulse" />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 w-full">
            <Button asChild variant="default" disabled={isLoading || !workspaceId}>
              <a
                href={workspaceId ? telegramUrl : "#"}
                target={workspaceId ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex items-center justify-center"
              >
                <Icons.Telegram className="mr-2 h-5 w-5 fill-current" />
                <span>{isLoading ? "Loading..." : "Open Bot"}</span>
              </a>
            </Button>
            <Button
              onClick={copyToClipboard}
              variant="outline"
              disabled={isLoading || !workspaceId}
              className="w-full border-border/50 hover:bg-secondary/50 transition-all hover:scale-[1.02]"
            >
              {copied ? (
                <div className="flex items-center text-green-600">
                  <Check className="mr-2 h-4 w-4" />
                  <span>Copied</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <Copy className="mr-2 h-4 w-4" />
                  <span>Copy Link</span>
                </div>
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground/80 text-center leading-relaxed max-w-[280px]">
            Once you scan or open the link, just tap <b>Start</b> in Telegram to
            automatically connect your account.
          </p>
        </div>

        <div className="bg-secondary/30 p-4 border-t border-border/50">
          <div className="flex items-center justify-center space-x-2 text-[10px] text-muted-foreground/60 uppercase tracking-widest font-semibold">
            <div className="h-1 w-1 rounded-full bg-blue-500" />
            <span>Secure End-to-End Connection</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
