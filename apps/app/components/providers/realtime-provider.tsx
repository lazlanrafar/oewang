"use client";

import { useRealtime } from "../../hooks/use-realtime";

export function RealtimeProvider() {
  useRealtime();
  return null;
}
