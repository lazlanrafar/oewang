"use client";

import { type ReactNode, useRef } from "react";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);

/**
 * Momentum smooth-scroll wrapper (GSAP ScrollSmoother — free since 3.13).
 *
 * The header is rendered OUTSIDE this wrapper (position: fixed) so it isn't
 * transformed by the smoother. On reduced-motion or if GSAP fails to init, we
 * never add `.smoother-ready`, so #smooth-wrapper stays static and the page
 * scrolls natively — content is never dependent on the smoother for layout.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reduce) return;

      const smoother = ScrollSmoother.create({
        wrapper: "#smooth-wrapper",
        content: "#smooth-content",
        smooth: 1.2,
        effects: true, // enables data-speed / data-lag parallax
        normalizeScroll: true,
      });

      document.documentElement.classList.add("smoother-ready");

      // Serif fonts swap in after first paint — remeasure triggers so pinned
      // sections don't mis-fire on mis-measured line heights.
      document.fonts?.ready.then(() => ScrollTrigger.refresh());

      return () => {
        smoother.kill();
        document.documentElement.classList.remove("smoother-ready");
      };
    },
    { scope: wrapper },
  );

  return (
    <div id="smooth-wrapper" ref={wrapper}>
      <div id="smooth-content">{children}</div>
    </div>
  );
}
