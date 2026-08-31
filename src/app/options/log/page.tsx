"use client";

import Link from "next/link";
import { AuthGate } from "@/components/auth-gate";
import { DoseLogList } from "@/components/dose-log-list";

function LogPageContent() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-sm text-[var(--muted)]">
          <Link href="/options" className="text-[var(--accent)]">
            ← Options
          </Link>
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight text-[var(--ink)]">
          Log
        </h1>
      </header>

      <DoseLogList />
    </main>
  );
}

export default function LogPage() {
  return (
    <AuthGate>
      <LogPageContent />
    </AuthGate>
  );
}
