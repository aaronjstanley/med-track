"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  createNfcToken,
  storeNfcToken,
} from "@/lib/nfc-token";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ensureSafariNfcToken() {
    const supabase = createClient();
    const token = createNfcToken();
    const { error: tokenError } = await supabase.rpc("rotate_nfc_token", {
      p_token: token,
    });
    if (!tokenError) storeNfcToken(token);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();

    if (mode === "signin") {
      const { error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signError) {
        setError(signError.message);
        setBusy(false);
        return;
      }
      await ensureSafariNfcToken();
      router.replace(next);
      return;
    }

    const { data, error: signError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}${
          process.env.NEXT_PUBLIC_BASE_PATH ?? ""
        }/`,
      },
    });

    if (signError) {
      setError(signError.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      await ensureSafariNfcToken();
      router.replace(next);
      return;
    }

    setInfo(
      `Account created for ${email}. If email verification is enabled, check your inbox before signing in.`,
    );
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex gap-2 rounded-lg bg-[var(--surface)] p-1">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "signin"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)]"
          }`}
          onClick={() => {
            setMode("signin");
            setError(null);
            setInfo(null);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
            mode === "signup"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)]"
          }`}
          onClick={() => {
            setMode("signup");
            setError(null);
            setInfo(null);
          }}
        >
          Create account
        </button>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-[var(--muted)]">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-[var(--muted)]">Password</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </label>

      {error ? (
        <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {info ? (
        <p className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]">
          {info}
        </p>
      ) : null}

      <button type="submit" disabled={busy} className="btn-primary">
        {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>

      <p className="text-center text-xs leading-relaxed text-[var(--muted)]">
        Each person should use their own account. Your medicines stay private to
        your login.
      </p>
    </form>
  );
}
