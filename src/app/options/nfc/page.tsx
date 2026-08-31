"use client";

import Link from "next/link";
import { AuthGate } from "@/components/auth-gate";
import { NfcSetup } from "@/components/nfc-setup";

function NfcPageContent() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-sm text-[var(--muted)]">
          <Link href="/options" className="text-[var(--accent)]">
            ← Options
          </Link>
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight text-[var(--ink)]">
          NFC
        </h1>
      </header>

      <NfcSetup />
    </main>
  );
}

export default function NfcPage() {
  return (
    <AuthGate>
      <NfcPageContent />
    </AuthGate>
  );
}
