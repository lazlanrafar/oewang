import { DashboardWireframe } from "./wireframe/dashboard-wireframe";
import { TransactionsWireframe } from "./wireframe/transactions-wireframe";
import { ChatWireframe } from "./wireframe/chat-wireframe";
import { InvoiceWireframe } from "./wireframe/invoice-wireframe";
import type { WebsiteDictionary } from "@/lib/translations";

const WIREFRAMES = {
  dashboard: DashboardWireframe,
  transactions: TransactionsWireframe,
  chat: ChatWireframe,
  invoice: InvoiceWireframe,
};

function FeatureShowcase({
  title,
  description,
  features,
  wireframe,
  reverse,
}: {
  title: string;
  description: string;
  features: string[];
  wireframe: keyof typeof WIREFRAMES;
  reverse: boolean;
}) {
  const WireframeComponent = WIREFRAMES[wireframe];

  return (
    <section className="py-14 sm:py-18 bg-background">
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div className={reverse ? "lg:order-2" : ""}>
            <h3 className="font-serif text-2xl sm:text-3xl tracking-tight text-foreground mb-3">
              {title}
            </h3>
            <p className="text-muted-foreground text-base sm:text-lg mb-5 leading-relaxed">
              {description}
            </p>
            <ul className="space-y-2.5">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 rounded-none bg-foreground shrink-0" />
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={reverse ? "lg:order-1" : ""}>
            <div className="rounded-none border border-border/70 bg-muted/25 p-4 sm:p-5">
              <WireframeComponent />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeatureShowcases({
  dictionary,
}: {
  dictionary: WebsiteDictionary;
}) {
  const sections = [
    {
      title: dictionary.features.transactions.title,
      description: dictionary.features.transactions.description,
      features: dictionary.features.transactions.items,
      wireframe: "transactions" as const,
      reverse: false,
    },
    {
      title: dictionary.features.aiAssistant.title,
      description: dictionary.features.aiAssistant.description,
      features: dictionary.features.aiAssistant.items,
      wireframe: "chat" as const,
      reverse: true,
    },
    {
      title: dictionary.features.invoices.title,
      description: dictionary.features.invoices.description,
      features: dictionary.features.invoices.items,
      wireframe: "invoice" as const,
      reverse: false,
    },
    {
      title: dictionary.features.dashboard.title,
      description: dictionary.features.dashboard.description,
      features: dictionary.features.dashboard.items,
      wireframe: "dashboard" as const,
      reverse: true,
    },
  ];

  return (
    <>
      {sections.map((section, index) => (
        <div key={section.title}>
          <FeatureShowcase {...section} />
          {index < sections.length - 1 && (
            <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="h-px w-full border-t border-border/70" />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
