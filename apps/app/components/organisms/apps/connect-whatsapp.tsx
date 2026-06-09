"use client";

import { useCallback, useEffect, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Env } from "@workspace/constants";
import type { Dictionary } from "@workspace/dictionaries";
import { getIntegrationsAction } from "@workspace/modules/integrations/integrations.action";
import { getMe } from "@workspace/modules/user/user.action";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Icons } from "@workspace/ui";
import { Check, Copy, QrCode } from "lucide-react";
import * as QRCode from "qrcode";

export function ConnectWhatsApp({ dictionary }: { dictionary: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const result = await getMe();
      return result.success ? result.data : null;
    },
  });

  const { data: integrations } = useQuery({
    queryKey: ["integrations", "whatsapp-connect"],
    enabled: open,
    refetchInterval: open ? 2000 : false,
    queryFn: async () => {
      const result = await getIntegrationsAction();
      return result.success ? result.data : [];
    },
  });

  const workspaceId = me?.user?.workspace_id;
  const whatsappNumber = Env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const message = `Connect Oewang ${workspaceId}`;
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
    : "";

  const generateQRCode = useCallback(async () => {
    if (!whatsappUrl) return;
    try {
      const url = await QRCode.toDataURL(whatsappUrl, {
        width: 250,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
      });
      setQrCodeUrl(url);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  }, [whatsappUrl]);

  useEffect(() => {
    if (open && workspaceId && whatsappUrl) {
      generateQRCode();
    }
  }, [open, workspaceId, whatsappUrl, generateQRCode]);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener("openWhatsAppConnect", handleOpen);
    return () => window.removeEventListener("openWhatsAppConnect", handleOpen);
  }, []);

  useEffect(() => {
    if (!open || !integrations) return;
    type IntegrationStatus = { provider?: string; isActive?: boolean };
    const isConnected = integrations.some(
      (integration: IntegrationStatus) => integration?.provider === "whatsapp" && integration?.isActive,
    );
    if (!isConnected) return;

    queryClient.invalidateQueries({ queryKey: ["integrations"] });
    setOpen(false);
  }, [integrations, open, queryClient]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(whatsappUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden border-none bg-background p-0 sm:max-w-[500px]">
        <div className="p-8">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-tight">
              {dictionary.apps.connect.whatsapp.title}
            </DialogTitle>
            <DialogDescription className="pt-2 text-muted-foreground">
              {dictionary.apps.connect.whatsapp.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex flex-col items-center space-y-6 px-8">
          <div className="group relative">
            <div className="relative border bg-white p-3">
              {!isLoading && qrCodeUrl ? (
                // biome-ignore lint/performance/noImgElement: QR Code is a generated data URL
                <img src={qrCodeUrl} alt="WhatsApp QR Code" className="h-[200px] w-[200px]" />
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-md bg-secondary/30">
                  <QrCode className="h-12 w-12 animate-pulse text-muted-foreground" />
                </div>
              )}
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-4">
            <Button asChild variant="default" disabled={isLoading || !whatsappUrl}>
              <a
                href={whatsappUrl || "#"}
                target={whatsappUrl ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex items-center justify-center"
              >
                <Icons.WhatsApp className="mr-2 h-5 w-5 fill-current" />
                <span>{isLoading ? dictionary.common.loading : dictionary.apps.connect.whatsapp.button}</span>
              </a>
            </Button>
            <Button
              onClick={copyToClipboard}
              variant="outline"
              disabled={isLoading || !whatsappUrl}
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
