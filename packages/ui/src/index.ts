export * from "./hooks/use-mobile";
export * from "./lib/utils";

// ── Atomic Design Barrel Exports ────────────────────────────────────────────
// These re-export all components organised by tier. Import individual
// components from `@workspace/ui` as you always have — the paths below
// are additional convenience aliases.
export * from "./components/atoms"; // atoms barrel
export * from "./components/molecules"; // molecules barrel (incl. chart components)
export * from "./components/organisms"; // organisms barrel
