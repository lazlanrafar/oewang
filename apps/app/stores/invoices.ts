import type { Column } from "@tanstack/react-table";
import type { Invoice } from "@workspace/types";
import { create } from "zustand";

interface InvoicesState {
  columns: Column<Invoice, unknown>[];
  setColumns: (columns?: Column<Invoice, unknown>[]) => void;
}

export const useInvoicesStore = create<InvoicesState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),
}));
