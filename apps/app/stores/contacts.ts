import type { Column } from "@tanstack/react-table";
import type { Contact } from "@workspace/types";
import { create } from "zustand";

interface ContactsState {
  columns: Column<Contact, unknown>[];
  setColumns: (columns?: Column<Contact, unknown>[]) => void;
}

export const useContactsStore = create<ContactsState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),
}));
