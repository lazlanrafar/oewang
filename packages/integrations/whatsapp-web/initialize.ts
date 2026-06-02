// WhatsApp Web initialization — dispatch event to open the QR scan dialog
export const onInitialize = async ({
  accessToken: _accessToken,
  onComplete,
}: {
  accessToken: string;
  onComplete?: () => void;
}) => {
  window.dispatchEvent(new CustomEvent("openWhatsAppWebConnect"));
  if (onComplete) {
    onComplete();
  }
};
