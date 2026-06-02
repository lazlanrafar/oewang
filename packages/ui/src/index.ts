// ── Atomic Design Barrel Exports ────────────────────────────────────────────
// These re-export all components organised by tier. Import individual
// components from `@workspace/ui` as you always have — the paths below
// are additional convenience aliases.
export * from "./components/atoms"; // atoms barrel
export * from "./components/atoms/badge";
export * from "./components/molecules"; // molecules barrel (incl. chart components)
export * from "./components/organisms"; // organisms barrel
export * from "./hooks/use-mobile";
export * from "./lib/canvas-utils";
export * from "./lib/cookie.client";
// ── Shared UI Utilities & State ─────────────────────────────────────────────
export * from "./lib/fonts/registry";
export * from "./lib/local-storage.client";
export * from "./lib/preferences/layout";
export * from "./lib/preferences/layout-utils";
export * from "./lib/preferences/preferences-config";
export * from "./lib/preferences/preferences-storage";
export * from "./lib/preferences/theme";
export * from "./lib/preferences/theme-utils";
export * from "./lib/utils";
export * from "./stores/preferences-provider";
export * from "./stores/preferences-store";
