"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearStoredNfcToken,
  createNfcToken,
  getStoredNfcToken,
  storeNfcToken,
} from "@/lib/nfc-token";

export function NfcSetup() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [deviceReady, setDeviceReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDeviceReady(Boolean(getStoredNfcToken()));
    setReady(true);
  }, []);

  async function enableOnThisSafari() {
    setBusy(true);
    setError(null);
    const token = createNfcToken();
    const { error: err } = await supabase.rpc("rotate_nfc_token", {
      p_token: token,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    storeNfcToken(token);
    setDeviceReady(true);
    setBusy(false);
  }

  async function disableOnThisSafari() {
    if (
      !confirm(
        "Remove NFC auto-take from this Safari? Your tag can stay as /take/, but scans will ask you to sign in again until you re-enable.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    clearStoredNfcToken();
    const { error: err } = await supabase.rpc("clear_nfc_token");
    if (err) setError(err.message);
    setDeviceReady(false);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Keep your tag as{" "}
        <span className="font-medium text-[var(--ink)]">/take/</span>. NFC opens
        Safari (not the Home Screen app). Sign in once in Safari — then scans
        record a dose without logging in again. No need to rewrite the tag.
      </p>

      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : (
        <>
          <p className="text-sm text-[var(--ink)]">
            This Safari:{" "}
            {deviceReady ? (
              <span className="text-[var(--accent)]">ready for NFC scans</span>
            ) : (
              <span className="text-[var(--muted)]">needs setup</span>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={enableOnThisSafari}
            >
              {deviceReady
                ? "Refresh NFC for this Safari"
                : "Enable NFC on this Safari"}
            </button>
            {deviceReady ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={disableOnThisSafari}
              >
                Disable
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
