"use client";

import { useEffect } from "react";

export default function MobilePushRegistrationSync() {
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription || cancelled) return;
        const json = subscription.toJSON();
        await fetch("/api/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ endpoint: subscription.endpoint, keys: json.keys }),
        });
      } catch {
        // Sync er best-effort. Stillingasíðan sýnir notandanum villu ef hann
        // reynir sjálfur að virkja eða breyta tilkynningum.
      }
    }
    void sync();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
