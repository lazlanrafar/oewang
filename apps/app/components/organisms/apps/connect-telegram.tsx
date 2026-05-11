"use client";

import { useCallback, useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Env } from "@workspace/constants";
import type { Dictionary } from "@workspace/dictionaries";
import { getMe } from "@workspace/modules/user/user.action";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Icons } from "@workspace/ui";
import { Check, Copy, QrCode } from "lucide-react";
import * as QRCode from "qrcode";

export function ConnectTelegram({ dictionary }: { dictionary: Dictionary }) {
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

  const workspaceId = me?.user?.workspace_id;
  const userId = me?.user?.id;
  const botUsername = Env.NEXT_PUBLIC_TELEGRAM_BOT_USER || "OewangBot";
  const telegramUrl =
    workspaceId && userId
      ? `https://t.me/${botUsername}?start=${workspaceId}___${userId}`
      : `https://t.me/${botUsername}`;

  const generateQRCode = useCallback(async () => {
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
  }, [telegramUrl, workspaceId]);

  useEffect(() => {
    if (open && workspaceId && botUsername) {
      generateQRCode();
    }
  }, [open, workspaceId, botUsername, generateQRCode]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("openTelegramConnect", handleOpen);
    return () => window.removeEventListener("openTelegramConnect", handleOpen);
  }, []);

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
      <DialogContent className="overflow-hidden border-none bg-background p-0 sm:max-w-[500px]">
        <div className="p-8">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-tight">{dictionary.apps.connect.telegram.title}</DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground">
              {dictionary.apps.connect.telegram.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col items-center space-y-6 px-8">
          <div className="group relative">
            <div className="relative border bg-white p-3">
              {!isLoading && workspaceId && qrCodeUrl ? (
                <>
                  {/* biome-ignore lint/performance/noImgElement: QR Code is a generated data URL */}
                  <img src={qrCodeUrl} alt="Telegram QR Code" className="h-[200px] w-[200px]" />
                </>
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-secondary/30">
                  <QrCode className="h-12 w-12 animate-pulse text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-4">
            <Button asChild variant="default" disabled={isLoading || !workspaceId}>
              <a
                href={workspaceId ? telegramUrl : "#"}
                target={workspaceId ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex items-center justify-center"
              >
                <Icons.Telegram className="mr-2 h-5 w-5 fill-current" />
                <span>{isLoading ? dictionary.common.loading : dictionary.apps.connect.telegram.open_bot}</span>
              </a>
            </Button>
            <Button
              onClick={copyToClipboard}
              variant="outline"
              disabled={isLoading || !workspaceId}
              className="w-full border-border/50 transition-all hover:scale-[1.02] hover:bg-secondary/50"
            >
              {copied ? (
                <div className="flex items-center text-green-600">
                  <Check className="mr-2 h-4 w-4" />
                  <span>{dictionary.common.copied}</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <Copy className="mr-2 h-4 w-4" />
                  <span>{dictionary.common.copy_link}</span>
                </div>
              )}
            </Button>
          </div>

          <p className="max-w-[280px] text-center text-muted-foreground/80 text-xs leading-relaxed">
            {dictionary.apps.connect.telegram.footer}
          </p>
        </div>

        <div className="border-border/50 border-t bg-secondary/30 p-4">
          <div className="flex items-center justify-center space-x-2 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
            <div className="h-1 w-1 rounded-full bg-blue-500" />
            <span>{dictionary.apps.connect.secure_connection}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
