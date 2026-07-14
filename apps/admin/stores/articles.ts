import type { Column } from "@tanstack/react-table";
import type { Article } from "@workspace/types";
import { create } from "zustand";

interface ArticleState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;

  isOpen: boolean;
  mode: "create" | "edit";
  selectedArticle: Article | null;

  openCreate: () => void;
  openEdit: (article: Article) => void;
  close: () => void;
}

export const useArticleStore = create<ArticleState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),

  isOpen: false,
  mode: "create",
  selectedArticle: null,

  openCreate: () => set({ isOpen: true, mode: "create", selectedArticle: null }),
  openEdit: (article) => set({ isOpen: true, mode: "edit", selectedArticle: article }),
  close: () => set({ isOpen: false, selectedArticle: null }),
}));
