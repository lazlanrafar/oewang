import type { Column } from "@tanstack/react-table";
import { create } from "zustand";

interface ContactsState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;
}

export const useContactsStore = create<ContactsState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),
}));
