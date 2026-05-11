import type { Column, RowSelectionState, Updater } from "@tanstack/react-table";
import { create } from "zustand";

interface AccountsState {
  columns: Column<Record<string, unknown>, unknown>[];
  setColumns: (columns?: Column<Record<string, unknown>, unknown>[]) => void;
  rowSelection: Record<string, boolean>;
  setRowSelection: (updater: Updater<RowSelectionState>) => void;
  clearRowSelection: () => void;
}

export const useAccountsStore = create<AccountsState>()((set) => ({
  columns: [],
  rowSelection: {},
  setColumns: (columns) => set({ columns: columns || [] }),
  setRowSelection: (updater: Updater<RowSelectionState>) =>
    set((state) => {
      const newSelection = typeof updater === "function" ? updater(state.rowSelection) : updater;
      return { rowSelection: newSelection };
    }),
  clearRowSelection: () => set({ rowSelection: {} }),
}));
