"use client";
import { type RefObject, useEffect, useRef } from "react";

type RevealOptions = {
  y?: number;
  duration?: number;
  delay?: number;
};

export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: RevealOptions): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let revert: (() => void) | null = null;

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([gsapModule, { ScrollTrigger }]) => {
      if (cancelled) return;
      const gsap = gsapModule.gsap ?? gsapModule.default;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        gsap.fromTo(
          el,
          { opacity: 0, y: options?.y ?? 20 },
          {
            opacity: 1,
            y: 0,
            duration: options?.duration ?? 0.65,
            delay: options?.delay ?? 0,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          },
        );
      });
      revert = () => ctx.revert();
    });

    return () => {
      cancelled = true;
      revert?.();
    };
  }, [options?.y, options?.duration, options?.delay]);

  return ref;
}
