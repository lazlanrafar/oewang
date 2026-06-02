"use client";

import { useEffect } from "react";

export function usePushNotifications() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[SW] Registration failed:", err);
    });
  }, []);
}
