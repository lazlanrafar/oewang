import { getGmailInstallUrlAction } from "@workspace/modules/integrations/integrations.action";

export const onInitialize = async ({
  accessToken: _accessToken,
  onComplete,
}: {
  accessToken: string;
  onComplete?: () => void;
}) => {
  const result = await getGmailInstallUrlAction();
  if (result.success && result.data?.url) {
    window.location.href = result.data.url;
  }
  if (onComplete) onComplete();
};
