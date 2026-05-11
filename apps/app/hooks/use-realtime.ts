"use client";

import { useCallback, useEffect, useRef } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Env } from "@workspace/constants";

/**
 * useRealtime - Custom hook to listen for data change notifications via WebSockets.
 *
 * It automatically reconnects on failure and invalidates React Query caches
 * when a notification is received for a specific data type.
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(async () => {
    // Browser automatically attaches cookies for same-site WebSocket requests.
    // Avoid query-token transport in production to prevent token leakage via URLs/logs.
    const apiUrl = Env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";
    const baseWsUrl = apiUrl.replace(/^http/, "ws").replace(/\/$/, "");
    const wsUrl = `${baseWsUrl}/v1/realtime`;

    console.log("[Realtime] Attempting connection to", wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("[Realtime] ✅ Connected and listening for updates");
        reconnectAttempts.current = 0;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("[Realtime] 📥 Received event:", data);

          if (data.type) {
            console.log(`[Realtime] 🔄 Invalidating queries for: ${data.type}`);

            // Invalidate the relevant query key (fuzzy match: unknown key starting with this type)
            queryClient.invalidateQueries({
              queryKey: [data.type],
              refetchType: "all",
            });

            // If it's a critical type, we might want to invalidate others or global settings
            if (data.type === "transactions" || data.type === "wallets") {
              queryClient.invalidateQueries({ queryKey: ["workspace", "active"] });
            }

            // Trigger a lightweight router refresh to update any server-side rendered data on the current page
            // This is safe to call from client components in Next.js 16
            // import { refresh } from "next/cache" is server only, but window.location or router.refresh works
          }
        } catch (e) {
          console.error("[Realtime] ❌ Failed to parse message", e);
        }
      };

      ws.onclose = (event) => {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
        console.log(
          `[Realtime] ⚠️ Disconnected (Code: ${event.code}, Reason: ${event.reason || "None"}), retrying in ${delay / 1000}s...`,
        );
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (err) => {
        console.error("[Realtime] 🛑 WebSocket Error Event:", err);
      };
    } catch (e) {
      console.error("[Realtime] ❌ Connection failed", e);
      reconnectTimeoutRef.current = setTimeout(connect, 5000);
    }
  }, [queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return null;
}
