"use client";

import { useEffect, useState } from "react";

type Labels = {
  title: string;
  help: string;
  enable: string;
  disable: string;
  enabled: string;
  disabled: string;
  blocked: string;
  unavailable: string;
  notConfigured: string;
  sound: string;
  soundHelp: string;
  saving: string;
  error: string;
};

type Props = {
  vapidPublicKey: string | null;
  labels: Labels;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

async function persistSubscription(subscription: PushSubscription, soundEnabled?: boolean) {
  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: json.keys,
      ...(typeof soundEnabled === "boolean" ? { soundEnabled } : {}),
    }),
  });
  if (!response.ok) throw new Error("PUSH_SUBSCRIPTION_SAVE_FAILED");
  return response.json() as Promise<{ ok: boolean; soundEnabled?: boolean }>;
}

export default function MobilePushSettings({ vapidPublicKey, labels }: Props) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const ok =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!ok) {
        setSupported(false);
        return;
      }
      setPermission(Notification.permission);
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (cancelled) return;
      setSubscription(existing);
      if (existing) {
        try {
          const result = await persistSubscription(existing);
          if (!cancelled && typeof result.soundEnabled === "boolean") {
            setSoundEnabled(result.soundEnabled);
          }
        } catch {
          if (!cancelled) setError(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!vapidPublicKey || !supported) return;
    setBusy(true);
    setError(false);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const next =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));
      const result = await persistSubscription(next, soundEnabled);
      setSubscription(next);
      if (typeof result.soundEnabled === "boolean") setSoundEnabled(result.soundEnabled);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription) return;
    setBusy(true);
    setError(false);
    try {
      await fetch("/api/push/subscription", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
      setSubscription(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function changeSound(next: boolean) {
    setSoundEnabled(next);
    if (!subscription) return;
    setBusy(true);
    setError(false);
    try {
      await persistSubscription(subscription, next);
    } catch {
      setError(true);
      setSoundEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  const statusText = !vapidPublicKey
    ? labels.notConfigured
    : !supported
      ? labels.unavailable
      : permission === "denied"
        ? labels.blocked
        : subscription
          ? labels.enabled
          : labels.disabled;

  return (
    <section className="rounded-2xl border bg-slate-50 p-4">
      <h2 className="font-bold text-slate-950">{labels.title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{labels.help}</p>
      <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">{statusText}</p>

      {error ? <p className="mt-2 text-sm font-semibold text-rose-700">{labels.error}</p> : null}

      {subscription ? (
        <label className="mt-4 flex items-start gap-3 rounded-xl border bg-white p-3">
          <input
            type="checkbox"
            checked={soundEnabled}
            disabled={busy}
            onChange={(event) => void changeSound(event.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block font-semibold text-slate-900">{labels.sound}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">{labels.soundHelp}</span>
          </span>
        </label>
      ) : null}

      {vapidPublicKey && supported && permission !== "denied" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void (subscription ? disable() : enable())}
          className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? labels.saving : subscription ? labels.disable : labels.enable}
        </button>
      ) : null}
    </section>
  );
}
