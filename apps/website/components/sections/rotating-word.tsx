"use client";

import { useEffect, useRef } from "react";

const TYPE_MS = 130; // per char typed
const ERASE_MS = 80; // per char erased
const HOLD_MS = 5000; // pause on a full word

/**
 * Typewriter: holds a word, erases it char-by-char, types the next, repeat. The
 * text is mutated via ref (not React state) so it never fights the surrounding
 * SplitText line-mask or React reconciliation. SSR renders words[0];
 * reduced-motion leaves the first word (no caret blink).
 */
export function RotatingWord({
  words,
  className,
}: {
  words: string[];
  className?: string;
}) {
  const wordRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = wordRef.current;
    if (!el || words.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let index = 0;
    let timer: ReturnType<typeof setTimeout>;

    const typeNext = () => {
      index = (index + 1) % words.length;
      const target = words[index] ?? "";
      let n = 0;
      const step = () => {
        n += 1;
        el.textContent = target.slice(0, n);
        timer = setTimeout(
          n < target.length ? step : erase,
          n < target.length ? TYPE_MS : HOLD_MS,
        );
      };
      step();
    };

    const erase = () => {
      const current = el.textContent ?? "";
      let n = current.length;
      const step = () => {
        n -= 1;
        el.textContent = current.slice(0, Math.max(n, 0));
        if (n > 0) timer = setTimeout(step, ERASE_MS);
        else typeNext();
      };
      step();
    };

    timer = setTimeout(erase, HOLD_MS);
    return () => clearTimeout(timer);
  }, [words]);

  return (
    <em className={className}>
      <span ref={wordRef}>{words[0]}</span>
      <span aria-hidden="true" className="typing-caret">
        |
      </span>
    </em>
  );
}
