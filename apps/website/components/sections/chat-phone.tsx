"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useGSAP } from "@gsap/react";
import { Icons } from "@workspace/ui/atoms";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Bell, LineChart, MessageCircle, Receipt } from "lucide-react";

import { CHAT_SCENARIOS, type ChatMessage } from "@/lib/chat-scenarios";
import type { WebsiteDictionary } from "@/lib/translations";

// Rail icon per scenario (midday-style icon + label navigation).
const RAIL_ICONS: Record<string, typeof Bell> = {
  notification: Bell,
  capture: Receipt,
  ask: MessageCircle,
  insights: LineChart,
};

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollSmoother);

// iPhone 17 Pro mock geometry (from midday). The SVG frame is rendered at
// 418×890; the screen opening is this path, and content is authored at 418×890
// then scaled into the opening.
const STAGE_W = 418;
const STAGE_H = 890;
const SCREEN_LEFT = 18.05;
const SCREEN_TOP = 20.4;
const SCREEN_W = 381.9;
const SCREEN_H = 849.2;
const SCREEN_PATH =
  "M113.81 20.4039C80.2907 20.4039 63.5312 20.4036 50.7286 27.0752C39.467 32.9438 30.3109 42.3083 24.5729 53.8261C18.0497 66.92 18.05 84.0608 18.05 118.3428V771.6572C18.05 805.9407 18.0497 823.08 24.5729 836.1725C30.3109 847.691 39.467 857.0574 50.7286 862.9259C63.5312 869.5961 80.2907 869.5961 113.81 869.5961H304.19C337.7093 869.5961 354.4688 869.5961 367.2714 862.9259C378.5332 857.0574 387.6893 847.691 393.4273 836.1725C399.9505 823.08 399.95 805.9407 399.95 771.6572V118.3428C399.95 84.0608 399.9505 66.92 393.4273 53.8261C387.6893 42.3083 378.5332 32.9438 367.2714 27.0752C354.4688 20.4036 337.7093 20.4039 304.19 20.4039H113.81Z";

/* ---------- iOS chrome ---------- */

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-8 pt-3.5 text-[13px] text-foreground">
      <span className="font-medium">9:41</span>
      <div className="flex items-center gap-1.5">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
          <rect x="0" y="7" width="3" height="4" rx="0.5" />
          <rect x="4.5" y="5" width="3" height="6" rx="0.5" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="0.5" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.5" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 12" fill="currentColor" aria-hidden="true">
          <path d="M8 2.5c2.6 0 5 1 6.8 2.7l-1.4 1.5A7.6 7.6 0 0 0 8 4.5 7.6 7.6 0 0 0 2.6 6.7L1.2 5.2A9.6 9.6 0 0 1 8 2.5Zm0 4a5.6 5.6 0 0 1 3.9 1.6l-1.4 1.5A3.6 3.6 0 0 0 8 8.5c-1 0-1.9.4-2.5 1.1L4.1 8.1A5.6 5.6 0 0 1 8 6.5Zm0 3.8c.6 0 1.1.2 1.5.6L8 12.4 6.5 10.9c.4-.4.9-.6 1.5-.6Z" />
        </svg>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor" />
          <rect x="23" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}

function ChatHeader({ appName, status }: { appName: string; status: string }) {
  return (
    <div className="relative mt-8 flex flex-col items-center border-border/60 border-b px-4 pt-2 pb-4">
      <span className="absolute top-1 left-5 flex size-8 items-center justify-center rounded-full bg-[hsl(var(--surface))] text-muted-foreground">
        <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden="true">
          <path d="M7 1 1 7l6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="absolute top-1 right-5 flex size-8 items-center justify-center rounded-full bg-[hsl(var(--surface))] text-muted-foreground">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17 10.5V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3.5l5 4v-11l-5 4Z" />
        </svg>
      </span>

      <div className="flex size-12 items-center justify-center rounded-full border border-border bg-[hsl(var(--surface))] text-[hsl(var(--brand-accent))]">
        <Icons.LogoSmall className="size-6" />
      </div>
      <p className="mt-2 font-medium text-foreground text-sm">{appName}</p>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-block size-1.5 rounded-full bg-[hsl(var(--brand-accent))]" />
        {status}
      </p>
    </div>
  );
}

/* ---------- Bubbles ---------- */

function ReceiptThumb({ label }: { label: string }) {
  return (
    <div className="rounded-[16px] border border-[hsl(var(--brand-accent))]/40 bg-[hsl(var(--surface))] p-1.5">
      <div className="space-y-1.5 rounded-[10px] bg-[hsl(var(--card))] p-3.5">
        <div className="mx-auto h-2.5 w-20 bg-muted-foreground/30" />
        <div className="h-2 w-full bg-muted-foreground/15" />
        <div className="h-2 w-full bg-muted-foreground/15" />
        <div className="h-2 w-2/3 bg-muted-foreground/15" />
        <div className="mt-2.5 flex justify-between">
          <div className="h-2.5 w-12 bg-muted-foreground/30" />
          <div className="h-2.5 w-14 bg-[hsl(var(--brand-accent))]/60" />
        </div>
      </div>
      <p className="px-1 pt-1.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Bubble({ msg, delay, receiptLabel }: { msg: ChatMessage; delay: number; receiptLabel: string }) {
  const side = msg.role === "user" ? "self-end" : "self-start";
  const style = { animationDelay: `${delay}s` };

  if (msg.kind === "receipt") {
    return (
      <div className={`max-w-[74%] animate-msg ${side}`} style={style}>
        <ReceiptThumb label={receiptLabel} />
        {msg.text && (
          <div className="mt-2 rounded-[20px] bg-[hsl(var(--brand-accent))] px-4 py-2.5 text-[14px] text-[hsl(var(--brand-accent-foreground))] leading-snug">
            {msg.text}
          </div>
        )}
      </div>
    );
  }

  if (msg.kind === "txn") {
    return (
      <div className={`max-w-[82%] animate-msg ${side}`} style={style}>
        <div className="rounded-[16px] border border-border bg-[hsl(var(--surface))] p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-serif text-base text-foreground">{msg.merchant}</span>
            <span className="whitespace-nowrap font-serif text-base text-foreground">{msg.amount}</span>
          </div>
          <span className="mt-2 inline-block bg-[hsl(var(--brand-accent))]/15 px-2 py-0.5 text-[11px] text-[hsl(var(--brand-accent))]">
            {msg.category}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`max-w-[78%] animate-msg rounded-[20px] px-4 py-2.5 text-[14px] leading-snug ${side} ${
        msg.role === "user"
          ? "bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-accent-foreground))]"
          : "bg-[hsl(var(--surface))] text-foreground/90"
      }`}
      style={style}
    >
      {msg.text}
    </div>
  );
}

function LockScreen({
  time,
  date,
  notif,
}: {
  time: string;
  date: string;
  notif?: { app: string; body: string; time: string };
}) {
  return (
    <div className="flex h-full flex-col items-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(420px 340px at 50% 16%, hsl(var(--brand-accent)/0.12), transparent 70%)",
        }}
      />
      <div className="mt-14 animate-msg text-center" style={{ animationDelay: "0.1s" }}>
        <p className="text-muted-foreground text-sm">{date}</p>
        <p className="mt-1 font-serif text-[5.25rem] text-foreground leading-none tracking-tight">{time}</p>
      </div>
      {notif && (
        <div className="mt-10 w-full animate-msg px-4" style={{ animationDelay: "0.35s" }}>
          <div className="flex items-start gap-3 rounded-[20px] border border-border bg-[hsl(var(--surface))]/90 p-3.5 backdrop-blur-md">
            <div className="flex size-9 items-center justify-center rounded-[10px] border border-border bg-[hsl(var(--card))] text-[hsl(var(--brand-accent))]">
              <Icons.LogoSmall className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-[13px] text-foreground">{notif.app}</span>
                <span className="text-[11px] text-muted-foreground">{notif.time}</span>
              </div>
              <p className="mt-0.5 text-[13px] text-foreground/80 leading-snug">{notif.body}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Phone screen content (authored at 418×890) ---------- */

function PhoneScreen({ active, dictionary }: { active: number; dictionary: WebsiteDictionary }) {
  const d = dictionary.chatDemo;
  const scenario = CHAT_SCENARIOS[active] ?? CHAT_SCENARIOS[0];
  if (!scenario) return null;

  return (
    <div className="h-full w-full bg-[hsl(var(--background))] text-foreground">
      <StatusBar />
      {scenario.kind === "lock" ? (
        <LockScreen key={active} time={d.lockTime} date={d.lockDate} notif={scenario.notif} />
      ) : (
        <>
          <ChatHeader appName={d.appName} status={d.status} />
          <div key={active} className="flex flex-col gap-2.5 px-4 py-5">
            {(scenario.messages ?? []).map((msg, i) => (
              <Bubble
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed per-scenario order
                key={i}
                msg={msg}
                delay={0.12 + i * 0.5}
                receiptLabel={d.receiptLabel}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// The realistic phone: SVG frame overlaid on screen content, whole stage scaled.
function Phone({
  active,
  dictionary,
  scale,
}: {
  active: number;
  dictionary: WebsiteDictionary;
  scale: number;
}) {
  return (
    <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
      <div style={{ width: STAGE_W, height: STAGE_H, position: "relative" }}>
        {/* Screen content clipped to the screen opening */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `path('${SCREEN_PATH}')` }}>
          <div
            style={{
              position: "absolute",
              left: SCREEN_LEFT,
              top: SCREEN_TOP,
              width: STAGE_W,
              height: STAGE_H,
              transform: `scale(${SCREEN_W / STAGE_W}, ${SCREEN_H / STAGE_H})`,
              transformOrigin: "top left",
            }}
          >
            <PhoneScreen active={active} dictionary={dictionary} />
          </div>
        </div>
        {/* Titanium frame overlay (transparent screen reveals content beneath) */}
        {/* biome-ignore lint/performance/noImgElement: static decorative frame, not content */}
        <img
          src="/iphone.svg"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
        />
      </div>
    </div>
  );
}

export function ChatPhone({ dictionary }: { dictionary: WebsiteDictionary }) {
  const section = useRef<HTMLElement>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);
  const [active, setActive] = useState(0);
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);
  const [railVisible, setRailVisible] = useState(false);

  useEffect(() => setMounted(true), []);

  // Size the phone to roughly fill the viewport height and bleed a little below
  // the fold (like midday), so the floating rail sits in front of its bottom.
  useEffect(() => {
    const update = () => {
      const target = window.innerHeight / STAGE_H;
      setScale(Math.min(1.12, Math.max(0.8, target)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Desktop with motion: pin the phone + drive scenarios. The rail stays
      // visible for the whole range — from the hero peek ("top bottom") through
      // the end of the pin. We define the end EXPLICITLY relative to the peek
      // start so it doesn't depend on measuring the pin spacer (which was
      // making the rail disappear mid-pin).
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        const st = ScrollTrigger.create({
          trigger: section.current,
          start: "top top",
          end: `+=${CHAT_SCENARIOS.length * window.innerHeight}`,
          pin: pinned.current,
          onUpdate: (self) => {
            const i = Math.min(
              CHAT_SCENARIOS.length - 1,
              Math.floor(self.progress * CHAT_SCENARIOS.length),
            );
            setActive(i);
          },
        });
        stRef.current = st;

        const vis = ScrollTrigger.create({
          trigger: section.current,
          start: "top bottom",
          // peek (~1 viewport) + pin duration (N viewports).
          end: () => `+=${window.innerHeight * (CHAT_SCENARIOS.length + 1)}`,
          onToggle: (self) => setRailVisible(self.isActive),
        });

        return () => {
          st.kill();
          vis.kill();
          stRef.current = null;
        };
      });

      // Mobile / reduced motion: no pin — rail visible while the section is on
      // screen.
      mm.add("(max-width: 1023px), (prefers-reduced-motion: reduce)", () => {
        const vis = ScrollTrigger.create({
          trigger: section.current,
          start: "top bottom",
          end: "bottom top",
          onToggle: (self) => setRailVisible(self.isActive),
        });
        return () => vis.kill();
      });
    },
    { scope: section },
  );

  const goTo = (i: number) => {
    const st = stRef.current;
    if (!st) {
      setActive(i);
      return;
    }
    const y = st.start + ((i + 0.5) / CHAT_SCENARIOS.length) * (st.end - st.start);
    const smoother = ScrollSmoother.get();
    if (smoother) smoother.scrollTo(y, true);
    else window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <section ref={section} className="relative">
      <div ref={pinned} className="relative h-screen overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(720px 540px at 50% 24%, hsl(var(--brand-accent)/0.10), transparent 65%)",
          }}
        />

        {/* Phone anchored near the top so it peeks at the bottom of the hero. */}
        <div className="absolute inset-x-0 top-[80px] flex justify-center">
          <Phone active={active} dictionary={dictionary} scale={scale} />
        </div>
      </div>

      {/*
       * Floating navigation rail — portaled to <body> so it sits OUTSIDE the
       * ScrollSmoother transform (fixed positioning would otherwise break). It
       * floats in front of the phone's lower portion, visible from the hero
       * peek through the demo, like midday.
       */}
      {mounted &&
        createPortal(
          <div
            className={`fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4 transition-all duration-300 ${
              railVisible
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-3 opacity-0"
            }`}
          >
            <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto border border-border bg-[hsl(var(--card))]/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-[18px]">
              {CHAT_SCENARIOS.map((s, i) => {
                const Icon = RAIL_ICONS[s.id] ?? Bell;
                const isActive = i === active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={isActive}
                    className={`flex shrink-0 items-center gap-2 px-3 py-2 text-[13px] transition-colors ${
                      isActive
                        ? "bg-[hsl(var(--surface))] text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4" />
                    <span className="whitespace-nowrap font-medium">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
