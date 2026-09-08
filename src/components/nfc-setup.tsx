"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  clearStoredNfcToken,
  createNfcToken,
  getStoredNfcToken,
  storeNfcToken,
} from "@/lib/nfc-token";

const FUNCTION_URL =
  "https://ltryvlcrnjdfjyqcufgq.supabase.co/functions/v1/nfc-take";

export function NfcSetup() {
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [hasServerToken, setHasServerToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setToken(getStoredNfcToken());
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("nfc_token_hash")
        .eq("id", user.id)
        .maybeSingle();
      setHasServerToken(Boolean(data?.nfc_token_hash));
    })();
  }, [supabase]);

  async function generateToken() {
    setBusy(true);
    setError(null);
    setCopied(null);
    const next = createNfcToken();
    const { error: err } = await supabase.rpc("rotate_nfc_token", {
      p_token: next,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    storeNfcToken(next);
    setToken(next);
    setHasServerToken(true);
    setBusy(false);
  }

  async function disable() {
    if (!confirm("Disable NFC take for your account?")) return;
    setBusy(true);
    setError(null);
    clearStoredNfcToken();
    const { error: err } = await supabase.rpc("clear_nfc_token");
    if (err) setError(err.message);
    setToken(null);
    setHasServerToken(false);
    setBusy(false);
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  const bodyExample = useMemo(
    () =>
      JSON.stringify(
        {
          token: token ?? "YOUR_TOKEN",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        null,
        2,
      ),
    [token],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
        <p className="text-sm font-medium text-[var(--ink)]">
          True tap-to-complete (recommended)
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Opening a website from NFC will never feel as fast as the in-app
          button. On iPhone, use an <strong className="text-[var(--ink)]">Apple Shortcut</strong> that
          talks to MedTrack directly — no Safari, no login screen.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          For that to work cleanly, remove the URL from the tag (or leave the
          tag blank). Shortcuts binds to the physical tag itself.
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-xl text-[var(--ink)]">1. Create your key</h2>
        <p className="text-sm text-[var(--muted)]">
          Status:{" "}
          {token || hasServerToken ? (
            <span className="text-[var(--accent)]">key active</span>
          ) : (
            <span>no key yet</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={generateToken}
          >
            {token || hasServerToken ? "Generate new key" : "Generate NFC key"}
          </button>
          {token || hasServerToken ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={disable}
            >
              Disable
            </button>
          ) : null}
        </div>
        {token ? (
          <div className="rounded-lg border border-[var(--line)] bg-white/50 px-3 py-2">
            <p className="text-xs text-[var(--muted)]">Your key (copy into Shortcuts)</p>
            <p className="mt-1 break-all font-mono text-xs text-[var(--ink)]">{token}</p>
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => copy("key", token)}
            >
              {copied === "key" ? "Copied" : "Copy key"}
            </button>
          </div>
        ) : hasServerToken ? (
          <p className="text-xs text-[var(--muted)]">
            A key exists, but the full value is only shown when you generate it.
            Tap Generate new key if you need to paste it into Shortcuts again.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-[var(--ink)]">2. Build the Shortcut</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--muted)]">
          <li>
            Open <span className="text-[var(--ink)]">Shortcuts → Automation → + → NFC</span>
          </li>
          <li>Scan your medicine-cabinet tag and name it</li>
          <li>
            Turn <span className="text-[var(--ink)]">Ask Before Running</span>{" "}
            <span className="text-[var(--ink)]">off</span>
          </li>
          <li>
            Add <span className="text-[var(--ink)]">Get Contents of URL</span>:
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>URL: the endpoint below</li>
              <li>Method: POST</li>
              <li>Request Body: JSON (paste the body below)</li>
            </ul>
          </li>
          <li>
            Add <span className="text-[var(--ink)]">Get Dictionary Value</span>{" "}
            for key <span className="font-mono text-xs">message</span>, then{" "}
            <span className="text-[var(--ink)]">Show Notification</span> with
            that text
          </li>
        </ol>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--muted)]">Endpoint</p>
          <div className="rounded-lg border border-[var(--line)] bg-white/50 px-3 py-2">
            <p className="break-all font-mono text-xs text-[var(--ink)]">
              {FUNCTION_URL}
            </p>
            <button
              type="button"
              className="btn-secondary mt-2"
              onClick={() => copy("url", FUNCTION_URL)}
            >
              {copied === "url" ? "Copied" : "Copy endpoint"}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[var(--muted)]">JSON body</p>
          <div className="rounded-lg border border-[var(--line)] bg-white/50 px-3 py-2">
            <pre className="overflow-x-auto text-xs text-[var(--ink)]">
              {bodyExample}
            </pre>
            <button
              type="button"
              className="btn-secondary mt-2"
              disabled={!token}
              onClick={() => copy("body", bodyExample)}
            >
              {copied === "body" ? "Copied" : "Copy JSON body"}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl text-[var(--ink)]">3. Tag contents</h2>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Clear the written <span className="text-[var(--ink)]">/take/</span>{" "}
          URL from the tag (NFC Tools → erase / write empty). Otherwise iPhone
          will keep opening Safari. The Shortcut still recognizes the same
          physical tag.
        </p>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          The in-app <span className="text-[var(--ink)]">Take current medicine</span>{" "}
          button stays for when you are already in MedTrack.
        </p>
      </section>
    </div>
  );
}
