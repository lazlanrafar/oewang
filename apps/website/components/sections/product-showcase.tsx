"use client";

import { useRef } from "react";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import type { WebsiteDictionary } from "@/lib/translations";
import { ChatWireframe } from "./wireframe/chat-wireframe";
import { DashboardWireframe } from "./wireframe/dashboard-wireframe";
import { TransactionsWireframe } from "./wireframe/transactions-wireframe";
import { Container, SectionLabel } from "./_shared";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const VISUALS = [DashboardWireframe, TransactionsWireframe, ChatWireframe];

/**
 * Pinned + scrubbed showcase — the signature scroll moment. The section pins
 * while a scrub timeline cross-fades the three product visuals (clip-path
 * reveal) and highlights the matching step. Reduced-motion / no-JS: the section
 * is a normal stacked layout with everything visible (no pin, no hide).
 */
export function ProductShowcase({
  dictionary,
}: {
  dictionary: WebsiteDictionary;
}) {
  const scope = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const root = scope.current;
        if (!root) return;
        const panels = gsap.utils.toArray<HTMLElement>("[data-visual]", root);
        const steps = gsap.utils.toArray<HTMLElement>("[data-step]", root);
        if (panels.length < 2) return;

        // Stack visuals; only the first is revealed initially.
        gsap.set(panels, {
          clipPath: "inset(0% 0% 100% 0%)",
          position: "absolute",
          inset: 0,
        });
        const firstPanel = panels[0];
        const firstStep = steps[0];
        if (firstPanel) gsap.set(firstPanel, { clipPath: "inset(0% 0% 0% 0%)" });
        gsap.set(steps, { opacity: 0.35 });
        if (firstStep) gsap.set(firstStep, { opacity: 1 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: scope.current,
            start: "top top",
            end: () => `+=${panels.length * 520}`,
            pin: "[data-pin]",
            scrub: 1,
          },
        });

        for (let i = 1; i < panels.length; i++) {
          const panel = panels[i];
          const prevStep = steps[i - 1];
          const step = steps[i];
          if (!panel) continue;
          tl.to(panel, {
            clipPath: "inset(0% 0% 0% 0%)",
            ease: "power2.inOut",
            duration: 1,
          });
          if (prevStep) tl.to(prevStep, { opacity: 0.35, duration: 0.4 }, "<");
          if (step) tl.to(step, { opacity: 1, duration: 0.4 }, "<");
        }
      });
    },
    { scope },
  );

  return (
    <section id="overview-flow" ref={scope}>
      {/* The PINNED block is a full-viewport, vertically-centered container so
          the whole thing (title + steps + visual) stays composed on screen while
          the scrub runs — instead of the title scrolling away above it. */}
      <div
        data-pin
        className="flex min-h-screen flex-col justify-center py-24"
      >
        <Container>
          <div className="max-w-2xl">
            <SectionLabel>{dictionary.showcase.label}</SectionLabel>
            <h2 className="mt-4 font-serif text-3xl text-foreground leading-[1.1] tracking-tight sm:text-4xl">
              {dictionary.showcase.title}
            </h2>
            <p className="mt-3 text-muted-foreground">
              {dictionary.showcase.subtitle}
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            {/* Steps */}
            <ol className="order-2 space-y-5 lg:order-1">
              {dictionary.showcase.steps.map((step, i) => (
                <li key={step.title} data-step className="flex gap-4">
                  <span className="mt-1 font-mono text-[hsl(var(--brand-accent))] text-sm">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-serif text-foreground text-lg tracking-tight">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                      {step.caption}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            {/* Stacked visuals */}
            <div className="relative order-1 min-h-[280px] lg:order-2 lg:min-h-[380px]">
              {VISUALS.map((Visual, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed visual order
                  key={i}
                  data-visual
                  className="border border-border bg-[hsl(var(--card))] p-2 shadow-2xl shadow-black/40"
                >
                  <Visual />
                </div>
              ))}
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
