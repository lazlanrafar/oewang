"use client";

import { useCallback, useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { Env } from "@workspace/constants";
import type { Dictionary } from "@workspace/dictionaries";
import { getMe } from "@workspace/modules/user/user.action";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Icons } from "@workspace/ui";
import { Check, Copy, Lock, QrCode } from "lucide-react";
import * as QRCode from "qrcode";

export function ConnectWhatsApp({ dictionary }: { dictionary: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      return result.success ? result.data : null;
    },
  });

  const params = useParams();
  const _locale = (params.locale as string) || "en";
  const workspaceId = me?.user?.workspace_id;
  const activeWorkspace = me?.workspaces.find((w) => w.id === workspaceId);
  const planName = activeWorkspace?.plan_name || "Starter";
  const isPro = planName === "Pro" || planName === "Business";
  const whatsappNumber = Env.NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER;
  const message = `Connect Oewang ${workspaceId}`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  const generateQRCode = useCallback(async () => {
    if (!whatsappNumber) return;

    try {
      const url = await QRCode.toDataURL(whatsappUrl, {
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
  }, [whatsappNumber, whatsappUrl]);

  useEffect(() => {
    if (open && workspaceId && whatsappNumber && isPro) {
      generateQRCode();
    }
  }, [open, workspaceId, whatsappNumber, isPro, generateQRCode]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);

    window.addEventListener("openWhatsAppConnect", handleOpen);
    window.addEventListener("openWhatsAppTwilioConnect", handleOpen);

    return () => {
      window.removeEventListener("openWhatsAppConnect", handleOpen);
      window.removeEventListener("openWhatsAppTwilioConnect", handleOpen);
    };
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(whatsappUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  if (!whatsappNumber) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden border-none bg-background p-0 sm:max-w-[500px]">
        <div className="p-8">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-tight">
              {dictionary.apps.connect.whatsapp.title} (Twilio)
            </DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground">
              {dictionary.apps.connect.whatsapp.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col items-center space-y-6 px-8">
          {!isPro ? (
            <div className="flex w-full flex-col items-center justify-center rounded-xl border border-border border-dashed bg-secondary/20 p-8">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <h4 className="font-bold text-lg">{dictionary.apps.connect.whatsapp.premium_title}</h4>
              <p className="mt-2 mb-6 text-center text-muted-foreground text-sm">
                {dictionary.apps.connect.whatsapp.premium_description}
              </p>
              <Button disabled className="w-full">
                {dictionary.apps.connect.whatsapp.coming_soon_title}
              </Button>
            </div>
          ) : (
            <>
              <div className="group relative">
                <div className="relative border bg-white p-3">
                  {qrCodeUrl ? (
                    <>
                      {/* biome-ignore lint/performance/noImgElement: QR Code is a generated data URL */}
                      <img src={qrCodeUrl} alt="WhatsApp QR Code" className="h-[200px] w-[200px]" />
                    </>
                  ) : (
                    <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-secondary/30">
                      <QrCode className="h-12 w-12 animate-pulse text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid w-full grid-cols-2 gap-4">
                <Button asChild variant="default">
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center"
                  >
                    <Icons.WhatsApp className="mr-2 h-5 w-5 fill-current" />
                    <span>{dictionary.apps.connect.whatsapp.button}</span>
                  </a>
                </Button>
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
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
                {dictionary.apps.connect.whatsapp.footer_info}
              </p>
            </>
          )}
        </div>

        <div className="border-border/50 border-t bg-secondary/30 p-4">
          <div className="flex items-center justify-center space-x-2 font-semibold text-[10px] text-muted-foreground/60 uppercase tracking-widest">
            <div className="h-1 w-1 rounded-full bg-green-500" />
            <span>{dictionary.apps.connect.secure_connection}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
