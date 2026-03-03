import type { Column } from "@tanstack/react-table";
import { create } from "zustand";
import type { Pricing } from "@workspace/types";

interface PricingState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;

  // Drawer State
  isOpen: boolean;
  isDetailOpen: boolean;
  mode: "create" | "edit";
  selectedPricing: Pricing | null;

  // Drawer Actions
  openCreate: () => void;
  openEdit: (pricing: Pricing) => void;
  openDetail: (pricing: Pricing) => void;
  close: () => void;
  closeDetail: () => void;
}

export const usePricingStore = create<PricingState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),

  isOpen: false,
  isDetailOpen: false,
  mode: "create",
  selectedPricing: null,

  openCreate: () =>
    set({ isOpen: true, mode: "create", selectedPricing: null }),
  openEdit: (pricing) =>
    set({ isOpen: true, mode: "edit", selectedPricing: pricing }),
  openDetail: (pricing) =>
    set({ isDetailOpen: true, selectedPricing: pricing }),
  close: () => set({ isOpen: false, selectedPricing: null }),
  closeDetail: () => set({ isDetailOpen: false, selectedPricing: null }),
}));
