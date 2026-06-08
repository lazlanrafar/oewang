"use client";

import { useRef } from "react";

import { useGsapReveal } from "@/lib/use-gsap-reveal";
import type { WebsiteDictionary } from "@/lib/translations";

import { ChatWireframe } from "./wireframe/chat-wireframe";
import { DashboardWireframe } from "./wireframe/dashboard-wireframe";
import { TransactionsWireframe } from "./wireframe/transactions-wireframe";

type WireframeComponent = React.ComponentType;

function FeatureChapter({
  id,
  label,
  title,
  subtitle,
  items,
  Wireframe,
  reverse,
}: {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  items: readonly string[];
  Wireframe: WireframeComponent;
  reverse: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useGsapReveal(ref);

  return (
    <section id={id} ref={ref} className="bg-background py-14 sm:py-18">
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className={reverse ? "lg:order-2" : ""}>
            <p className="mb-3 text-muted-foreground text-xs uppercase tracking-[0.22em]">{label}</p>
            <h2 className="mb-3 font-serif text-2xl text-foreground tracking-tight sm:text-3xl">{title}</h2>
            <p className="mb-5 text-base text-muted-foreground leading-relaxed">{subtitle}</p>
            <ul className="space-y-2.5">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-none bg-foreground" />
                  <span className="text-foreground text-sm">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className={reverse ? "lg:order-1" : ""}>
            <div className="rounded-none border border-border/70 bg-muted/25 p-4 sm:p-5">
              <Wireframe />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeatureShowcases({ dictionary }: { dictionary: WebsiteDictionary }) {
  return (
    <>
      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="h-px w-full border-border/70 border-t" />
      </div>

      <FeatureChapter
        id="clarity"
        label={dictionary.clarity.label}
        title={dictionary.clarity.title}
        subtitle={dictionary.clarity.subtitle}
        items={dictionary.clarity.items}
        Wireframe={TransactionsWireframe}
        reverse={false}
      />

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="h-px w-full border-border/70 border-t" />
      </div>

      <FeatureChapter
        id="ai"
        label={dictionary.ai.label}
        title={dictionary.ai.title}
        subtitle={dictionary.ai.subtitle}
        items={dictionary.ai.items}
        Wireframe={ChatWireframe}
        reverse={true}
      />

      <div className="mx-auto max-w-[1300px] px-4 sm:px-6 lg:px-8">
        <div className="h-px w-full border-border/70 border-t" />
      </div>

      <FeatureChapter
        id="workspaces"
        label={dictionary.workspaces.label}
        title={dictionary.workspaces.title}
        subtitle={dictionary.workspaces.subtitle}
        items={dictionary.workspaces.items}
        Wireframe={DashboardWireframe}
        reverse={false}
      />
    </>
  );
}
