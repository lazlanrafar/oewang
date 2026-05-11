import type { RowSelectionState } from "@tanstack/react-table";
import { create } from "zustand";

interface DebtsState {
  rowSelection: RowSelectionState;
  setRowSelection: (rowSelection: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void;
  resetSelection: () => void;
}

export const useDebtsStore = create<DebtsState>((set) => ({
  rowSelection: {},
  setRowSelection: (updater) =>
    set((state) => ({
      rowSelection: typeof updater === "function" ? updater(state.rowSelection) : updater,
    })),
  resetSelection: () => set({ rowSelection: {} }),
}));
