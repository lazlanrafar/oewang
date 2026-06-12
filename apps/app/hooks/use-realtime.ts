"use client";

import { useCallback, useEffect, useRef } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Env } from "@workspace/constants";

/**
 * useRealtime — listens for data change notifications from the API via WebSocket
 * and invalidates the matching TanStack Query caches so any open tab stays in
 * sync without polling or page reloads.
 *
 * The API emits events with `{ workspaceId, type }`. Each `type` maps to one or
 * more query keys via the table below. Unknown types fall through to a no-op
 * (we never invalidate the entire cache on an unknown event).
 *
 * To add a new event type:
 * 1. Call `RealtimeService.notifyValueChange(workspaceId, "your.type")` in the API
 * 2. Add a case in `INVALIDATIONS` below mapping the type to the query keys
 */

type InvalidationKeys = readonly (readonly unknown[])[];

/** Explicit type → query-key invalidation map. */
const INVALIDATIONS: Record<string, InvalidationKeys> = {
  transactions: [["transactions"], ["metrics"], ["workspace", "active"]],
  wallets: [["wallets"], ["workspace", "active"]],
  categories: [["categories"]],
  notifications: [["notifications"]],
  contacts: [["contacts"]],
  debts: [["debts"]],
  budgets: [["budgets"]],
  invoices: [["invoices"]],
  settings: [["settings", "transaction"], ["settings", "sub-currencies"]],
  workspace: [["workspace", "active"], ["user", "me"]],
  // Emitted by API after AI token consumption or vault file uploads.
  "workspace.usage": [["workspace", "active"], ["ai", "quota"]],
};

export function useRealtime() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const isUnmountingRef = useRef(false);

  const connect = useCallback(async () => {
    if (isUnmountingRef.current) return;

    // Browser automatically attaches cookies for same-site WebSocket requests.
    // Avoid query-token transport in production to prevent token leakage via URLs/logs.
    const apiUrl = Env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    let baseWsUrl = apiUrl.replace(/^http/, "ws").replace(/\/$/, "");

    // In local development, if accessed via localhost/127.0.0.1, direct WebSockets to localhost
    // to bypass potential HTTPS/tunnel issues and ensure same-site cookies are attached correctly.
    if (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ) {
      let port = "3002";
      try {
        const urlObj = new URL(apiUrl);
        if (urlObj.port) port = urlObj.port;
      } catch {}
      baseWsUrl = `ws://localhost:${port}`;
    }

    const wsUrl = `${baseWsUrl}/v1/realtime`;

    if (process.env.NODE_ENV !== "production") {
      console.log("[Realtime] Connecting to", wsUrl);
    }

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("[Realtime] ✅ Connected");
        reconnectAttempts.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type?: string; workspaceId?: string };
          if (!data.type) return;

          const keysToInvalidate = INVALIDATIONS[data.type];
          if (!keysToInvalidate) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(`[Realtime] ⚠️ Unhandled event type: "${data.type}"`);
            }
            return;
          }

          if (process.env.NODE_ENV !== "production") {
            console.log(`[Realtime] 🔄 ${data.type} → invalidating ${keysToInvalidate.length} key(s)`);
          }

          for (const queryKey of keysToInvalidate) {
            queryClient.invalidateQueries({ queryKey });
          }
        } catch (e) {
          console.error("[Realtime] ❌ Failed to parse message", e);
        }
      };

      ws.onclose = (event) => {
        if (isUnmountingRef.current) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        console.log(
          `[Realtime] ⚠️ Disconnected (${event.code}${event.reason ? `: ${event.reason}` : ""}), retrying in ${delay / 1000}s`,
        );
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        console.warn("[Realtime] 🛑 WebSocket connection failed (API may not be running)");
      };
    } catch (e) {
      console.error("[Realtime] ❌ Connection failed", e);
      if (!isUnmountingRef.current) {
        reconnectTimeoutRef.current = setTimeout(connect, 5000);
      }
    }
  }, [queryClient]);

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();

    return () => {
      isUnmountingRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  return null;
}
