// WhatsApp initialization - dispatch event to open the connect dialog
export const onInitialize = async ({
  accessToken: _accessToken,
  onComplete,
}: {
  accessToken: string;
  onComplete?: () => void;
}) => {
  // Dispatch event to open WhatsApp connect dialog
  window.dispatchEvent(new CustomEvent("openWhatsAppConnect"));

  if (onComplete) {
    onComplete();
  }
};
