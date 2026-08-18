"use client";

import { useRef } from "react";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// Shared motion language — keep every section on the same eases/timings so the
// page feels authored, not assembled.
export const EASE = "power3.out";
export const DUR = 0.9;

/**
 * Masked, line-by-line reveal for a serif headline (the signature editorial
 * move). Splits into lines inside a mask so each line rises out of a clip.
 *
 * Accessibility/SSR: SplitText's rewrite keeps the original text for screen
 * readers. We animate `from` a hidden state so the resting DOM is visible — and
 * the `reduce` branch of matchMedia just leaves it visible. Nothing is gated
 * behind JS: if this never runs, the text is simply shown.
 */
export function useHeadlineReveal<T extends HTMLElement>(opts?: {
  start?: string;
  stagger?: number;
}) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const split = new SplitText(el, {
          type: "lines",
          mask: "lines",
          linesClass: "split-line",
        });
        gsap.set(el, { visibility: "visible" });
        gsap.from(split.lines, {
          yPercent: 110,
          opacity: 0,
          duration: DUR,
          ease: EASE,
          stagger: opts?.stagger ?? 0.12,
          scrollTrigger: { trigger: el, start: opts?.start ?? "top 85%" },
        });
        return () => split.revert();
      });

      // Reduced motion: ensure it's simply visible, no animation.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(el, { visibility: "visible" });
      });
    },
    { scope: ref },
  );

  return ref;
}

/**
 * Staggered fade+rise for a group of children matched by `selector` within the
 * scoped ref. Used for card grids, list items, pillars.
 */
export function useStaggerReveal<T extends HTMLElement>(
  selector: string,
  opts?: { start?: string; y?: number; stagger?: number },
) {
  const ref = useRef<T>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const targets = gsap.utils.toArray<HTMLElement>(selector, el);
      if (!targets.length) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(targets, {
          y: opts?.y ?? 28,
          opacity: 0,
          duration: DUR,
          ease: EASE,
          stagger: opts?.stagger ?? 0.09,
          scrollTrigger: { trigger: el, start: opts?.start ?? "top 80%" },
        });
      });
      // Reduced motion: gsap.from's resting state is the visible DOM, so a
      // no-op is correct — nothing to force.
    },
    { scope: ref },
  );

  return ref;
}
