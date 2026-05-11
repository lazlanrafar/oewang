"use client";

import { useMemo, useState } from "react";
import { BarChart3, Wallet, Users, Sparkles } from "lucide-react";
import type { WebsiteDictionary } from "@/lib/translations";

export function HowItWorksSection({
  dictionary,
}: {
  dictionary: WebsiteDictionary;
}) {
  const items = useMemo(
    () => [
      {
        title: dictionary.features.transactions.title,
        description: dictionary.features.transactions.description,
        points: dictionary.features.transactions.items,
        icon: Wallet,
      },
      {
        title: dictionary.features.aiAssistant.title,
        description: dictionary.features.aiAssistant.description,
        points: dictionary.features.aiAssistant.items,
        icon: Sparkles,
      },
      {
        title: dictionary.features.dashboard.title,
        description: dictionary.features.dashboard.description,
        points: dictionary.features.dashboard.items,
        icon: BarChart3,
      },
      {
        title: "One workspace, multiple collaborators",
        description:
          "Invite teammates, set roles, and keep every decision traceable in one shared finance workspace.",
        points: [
          "Member roles and permissions",
          "Shared categories and transaction views",
          "Faster handovers and approvals",
          "Single source of truth for the whole team",
        ],
        icon: Users,
      },
    ],
    [dictionary],
  );

  const [active, setActive] = useState(0);
  const activeItem = items[active] ?? items[0];
  if (!activeItem) return null;
  const ActiveIcon = activeItem.icon;

  return (
    <section className="py-18 sm:py-24 bg-background" id="how-it-works">
      <div className="max-w-[1300px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground mb-3">
            Why teams choose oewang
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-foreground">
            Clear day-to-day tracking for individuals and companies
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8">
          <div className="rounded-none border border-border/70 bg-background p-4 sm:p-5">
            {items.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                className={`w-full text-left rounded-none p-4 sm:p-5 transition-colors border ${
                  active === index
                    ? "border-foreground/30 bg-muted/35"
                    : "border-transparent hover:bg-muted/20"
                }`}
              >
                <p className="text-sm sm:text-base font-medium text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground mt-1.5">{item.description}</p>
              </button>
            ))}
          </div>

          <div className="rounded-none border border-border/70 bg-muted/25 p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-none border border-border px-3 py-1 text-xs text-muted-foreground">
              <ActiveIcon className="size-3.5" />
              Active capability
            </div>

            <h3 className="font-serif text-2xl tracking-tight mt-4">{activeItem.title}</h3>
            <p className="text-muted-foreground mt-2">{activeItem.description}</p>

            <div className="mt-5 space-y-2.5">
              {activeItem.points.map((point) => (
                <div key={point} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 rounded-none bg-foreground" />
                  <span className="text-sm text-foreground">{point}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
