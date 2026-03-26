// WhatsApp initialization - dispatch event to open the connect dialog
export const onInitialize = async ({
  accessToken,
  onComplete,
}: {
  accessToken: string;
  onComplete?: () => void;
}) => {
  // Dispatch event to open WhatsApp (Twilio) connect dialog
  window.dispatchEvent(new CustomEvent("openWhatsAppTwilioConnect"));

  if (onComplete) {
    onComplete();
  }
};
