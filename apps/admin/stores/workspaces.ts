import type { Column, RowSelectionState, Updater } from "@tanstack/react-table";
import { create } from "zustand";

interface WorkspacesState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;
  rowSelection: Record<string, boolean>;
  setRowSelection: (updater: Updater<RowSelectionState>) => void;
  clearRowSelection: () => void;
}

export const useWorkspacesStore = create<WorkspacesState>()((set, get) => ({
  columns: [],
  rowSelection: {},
  setColumns: (columns) => set({ columns: columns || [] }),
  setRowSelection: (updater: Updater<RowSelectionState>) =>
    set((state) => {
      const currentSelection = state.rowSelection;
      const newSelection =
        typeof updater === "function" ? updater(currentSelection) : updater;
      return {
        rowSelection: newSelection,
      };
    }),
  clearRowSelection: () => set({ rowSelection: {} }),
}));
