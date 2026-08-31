"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth-gate";
import { TakeButton } from "@/components/take-button";

function TakeContent() {
  const searchParams = useSearchParams();
  const nfcToken = useMemo(() => {
    const t = searchParams.get("t")?.trim();
    return t && t.length >= 20 ? t : null;
  }, [searchParams]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-10">
      <h1 className="font-display text-3xl tracking-tight text-[var(--ink)]">
        Taking dose
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {nfcToken
          ? "Recording via your NFC link…"
          : "Checking the current schedule for your time…"}
      </p>

      <TakeButton autoRun nfcToken={nfcToken} className="mt-8" />

      <Link
        href="/"
        className="mt-10 text-center text-sm font-medium text-[var(--accent)]"
      >
        Back to home
      </Link>
    </main>
  );
}

function TakePageInner() {
  const searchParams = useSearchParams();
  const hasToken = Boolean(searchParams.get("t")?.trim());

  if (hasToken) {
    return <TakeContent />;
  }

  return (
    <AuthGate>
      <TakeContent />
    </AuthGate>
  );
}

export default function TakePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center px-5 py-10">
          <p className="text-[var(--muted)]">Loading…</p>
        </main>
      }
    >
      <TakePageInner />
    </Suspense>
  );
}
