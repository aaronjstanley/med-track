"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { TakeButton } from "@/components/take-button";
import { createClient } from "@/lib/supabase/client";
import { getStoredNfcToken } from "@/lib/nfc-token";

function TakeContent({ nfcToken }: { nfcToken: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-10">
      <h1 className="font-display text-3xl tracking-tight text-[var(--ink)]">
        Taking dose
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Checking the current schedule for your time…
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
  const [ready, setReady] = useState(false);
  const [nfcToken, setNfcToken] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setHasSession(Boolean(session));
      setNfcToken(getStoredNfcToken());
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center px-5 py-10">
        <p className="text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  if (hasSession) {
    return (
      <AuthGate>
        <TakeContent nfcToken={null} />
      </AuthGate>
    );
  }

  if (nfcToken) {
    return <TakeContent nfcToken={nfcToken} />;
  }

  return (
    <AuthGate>
      <TakeContent nfcToken={null} />
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
