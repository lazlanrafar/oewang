"use client";

import { Check } from "lucide-react";

import type { WebsiteDictionary } from "@/lib/translations";
import { useHeadlineReveal } from "@/lib/motion";
import { ChatWireframe } from "./wireframe/chat-wireframe";
import { DashboardWireframe } from "./wireframe/dashboard-wireframe";
import { TransactionsWireframe } from "./wireframe/transactions-wireframe";
import { Container, SectionLabel } from "./_shared";

type WireframeComponent = React.ComponentType;
const WIREFRAMES: WireframeComponent[] = [
  TransactionsWireframe,
  ChatWireframe,
  DashboardWireframe,
];

function FeatureChapter({
  chapter,
  Wireframe,
  reverse,
}: {
  chapter: WebsiteDictionary["features"]["chapters"][number];
  Wireframe: WireframeComponent;
  reverse: boolean;
}) {
  const title = useHeadlineReveal<HTMLHeadingElement>();

  return (
    <div className="grid grid-cols-1 items-center gap-12 py-16 sm:py-20 lg:grid-cols-2">
      <div className={reverse ? "lg:order-2" : ""}>
        <SectionLabel>{chapter.label}</SectionLabel>
        <h3
          ref={title}
          className="reveal-headline mt-5 font-serif text-3xl text-foreground leading-tight tracking-tight sm:text-4xl"
        >
          {chapter.title}
        </h3>
        <p className="mt-4 max-w-md text-muted-foreground leading-relaxed">
          {chapter.description}
        </p>
        <ul className="mt-7 space-y-3">
          {chapter.points.map((point) => (
            <li key={point} className="flex items-center gap-3">
              <Check className="size-4 shrink-0 text-[hsl(var(--brand-accent))]" />
              <span className="text-foreground/90 text-sm">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={reverse ? "lg:order-1" : ""}>
        <div
          data-speed={reverse ? "1.06" : "0.94"}
          className="border border-border bg-[hsl(var(--card))] p-2 shadow-2xl shadow-black/40"
        >
          <Wireframe />
        </div>
      </div>
    </div>
  );
}

export function FeatureShowcases({
  dictionary,
}: {
  dictionary: WebsiteDictionary;
}) {
  return (
    <section id="features" className="py-16 sm:py-24">
      <Container>
        <div className="max-w-2xl">
          <SectionLabel>{dictionary.features.label}</SectionLabel>
          <h2 className="mt-5 font-serif text-3xl text-foreground leading-tight tracking-tight sm:text-5xl">
            {dictionary.features.title}
          </h2>
        </div>

        <div className="mt-6 divide-y divide-border">
          {dictionary.features.chapters.map((chapter, i) => (
            <FeatureChapter
              key={chapter.label}
              chapter={chapter}
              Wireframe={WIREFRAMES[i % WIREFRAMES.length] ?? DashboardWireframe}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
