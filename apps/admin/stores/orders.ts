import type { Column } from "@tanstack/react-table";
import { create } from "zustand";
import type { AdminOrderListing } from "@workspace/types";

interface OrdersState {
  columns: Column<any, unknown>[];
  setColumns: (columns?: Column<any, unknown>[]) => void;

  // Drawer State
  isDetailOpen: boolean;
  selectedOrder: AdminOrderListing | null;

  // Drawer Actions
  openDetail: (order: AdminOrderListing) => void;
  closeDetail: () => void;
}

export const useOrdersStore = create<OrdersState>()((set) => ({
  columns: [],
  setColumns: (columns) => set({ columns: columns || [] }),

  isDetailOpen: false,
  selectedOrder: null,

  openDetail: (order) => set({ isDetailOpen: true, selectedOrder: order }),
  closeDetail: () => set({ isDetailOpen: false, selectedOrder: null }),
}));
