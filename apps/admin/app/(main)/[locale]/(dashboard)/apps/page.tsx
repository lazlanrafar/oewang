import { ScrollableContent } from "@workspace/ui";
import { WhatsAppWebClient } from "../../../../../components/whatsapp-web/whatsapp-web-client";

export default function AppsPage() {
  return (
    <ScrollableContent className="h-full">
      <div className="flex flex-col h-full bg-background no-scrollbar">
        <WhatsAppWebClient />
      </div>
    </ScrollableContent>
  );
}
