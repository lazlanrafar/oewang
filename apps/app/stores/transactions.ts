import { create } from "zustand";
import type { RowSelectionState } from "@tanstack/react-table";

interface TransactionsState {
  rowSelection: RowSelectionState;
  setRowSelection: (
    rowSelection:
      | RowSelectionState
      | ((prev: RowSelectionState) => RowSelectionState),
  ) => void;
  resetSelection: () => void;
}

export const useTransactionsStore = create<TransactionsState>((set) => ({
  rowSelection: {},
  setRowSelection: (updater) =>
    set((state) => ({
      rowSelection:
        typeof updater === "function" ? updater(state.rowSelection) : updater,
    })),
  resetSelection: () => set({ rowSelection: {} }),
}));
