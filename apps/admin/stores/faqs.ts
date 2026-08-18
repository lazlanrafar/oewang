import type { Column } from "@tanstack/react-table";
import type { Faq } from "@workspace/types";
import { create } from "zustand";

interface FaqState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;

  isOpen: boolean;
  mode: "create" | "edit";
  selectedFaq: Faq | null;

  openCreate: () => void;
  openEdit: (faq: Faq) => void;
  close: () => void;
}

export const useFaqStore = create<FaqState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),

  isOpen: false,
  mode: "create",
  selectedFaq: null,

  openCreate: () => set({ isOpen: true, mode: "create", selectedFaq: null }),
  openEdit: (faq) => set({ isOpen: true, mode: "edit", selectedFaq: faq }),
  close: () => set({ isOpen: false, selectedFaq: null }),
}));
