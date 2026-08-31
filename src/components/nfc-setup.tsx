"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function NfcSetup() {
  const supabase = useMemo(() => createClient(), []);
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const takeUrl = useMemo(() => {
    if (!plainToken || typeof window === "undefined") return null;
    const base = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ""}`;
    return `${base.replace(/\/$/, "")}/take/?t=${plainToken}`;
  }, [plainToken]);

  useEffect(() => {
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setHasToken(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("nfc_token_hash")
        .eq("id", user.id)
        .maybeSingle();
      setHasToken(Boolean(data?.nfc_token_hash));
    })();
  }, [supabase]);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    const token = randomToken();
    const { error: err } = await supabase.rpc("rotate_nfc_token", {
      p_token: token,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    setPlainToken(token);
    setHasToken(true);
    setBusy(false);
  }

  async function clearToken() {
    if (!confirm("Disable the NFC link? Existing tag URLs will stop working.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc("clear_nfc_token");
    if (err) setError(err.message);
    else {
      setHasToken(false);
      setPlainToken(null);
    }
    setBusy(false);
  }

  async function copyUrl() {
    if (!takeUrl) return;
    await navigator.clipboard.writeText(takeUrl);
    setCopied(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        iPhone NFC opens Safari, which does not share login with the Home Screen
        app. Use a personal take link on the tag so a scan records the dose
        without signing in.
      </p>

      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {hasToken === null ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : (
        <>
          <p className="text-sm text-[var(--ink)]">
            Status:{" "}
            {hasToken ? (
              <span className="text-[var(--accent)]">NFC link active</span>
            ) : (
              <span className="text-[var(--muted)]">No NFC link yet</span>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={generate}
            >
              {hasToken ? "Generate new link" : "Generate NFC link"}
            </button>
            {hasToken ? (
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={clearToken}
              >
                Disable link
              </button>
            ) : null}
          </div>

          {plainToken && takeUrl ? (
            <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
              <p className="text-sm font-medium text-[var(--ink)]">
                Copy this once into NFC Tools / Shortcuts
              </p>
              <p className="mt-2 break-all font-mono text-xs text-[var(--muted)]">
                {takeUrl}
              </p>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={copyUrl}
              >
                {copied ? "Copied" : "Copy URL"}
              </button>
              <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
                Anyone with this URL can record a dose as you. Treat it like a
                password. Generating a new link invalidates the old one.
              </p>
            </div>
          ) : hasToken ? (
            <p className="text-xs text-[var(--muted)]">
              The full URL is only shown when you generate it. Create a new link
              if you need to rewrite your tag.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
