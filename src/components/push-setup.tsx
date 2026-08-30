"use client";

import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function PushSetup() {
  const [status, setStatus] = useState<"idle" | "on" | "denied" | "unsupported">(
    "idle",
  );
  const [busy, setBusy] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setStandalone(isStandalone);

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }

    void navigator.serviceWorker.register("/sw.js");

    void navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setStatus("on");
    });
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
          ),
        }));

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setStatus("on");
    } catch {
      setStatus("unsupported");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-[var(--muted)]">
        Push alerts need an installed Home Screen app on iPhone (iOS 16.4+).
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--ink)]">Reorder alerts</p>
      {!standalone ? (
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          On iPhone: Share → Add to Home Screen, then open Med Track from the
          icon and enable alerts.
        </p>
      ) : null}
      {status === "on" ? (
        <p className="mt-2 text-xs text-[var(--accent)]">Push alerts are on.</p>
      ) : status === "denied" ? (
        <p className="mt-2 text-xs text-[var(--danger)]">
          Notifications are blocked in Settings.
        </p>
      ) : (
        <button
          type="button"
          className="btn-secondary mt-3"
          disabled={busy}
          onClick={enable}
        >
          {busy ? "Enabling…" : "Enable push alerts"}
        </button>
      )}
    </div>
  );
}
