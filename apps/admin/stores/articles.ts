import type { Column } from "@tanstack/react-table";
import { create } from "zustand";

// Articles use dedicated new/edit PAGES (not a sheet), so this store only holds
// data-table column visibility state.
interface ArticleState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;
}

export const useArticleStore = create<ArticleState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),
}));
