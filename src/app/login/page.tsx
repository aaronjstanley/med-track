"use client";

import { Suspense } from "react";
import { AuthGate } from "@/components/auth-gate";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthGate requireAuth={false}>
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 flex-col justify-center px-5 py-12">
        <div className="mb-10">
          <p className="font-display text-4xl tracking-tight text-[var(--ink)]">
            MedTrack
          </p>
          <p className="mt-2 max-w-xs text-[var(--muted)]">
            Sign in to track doses and remaining counts.
          </p>
        </div>
        <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
          <LoginForm />
        </Suspense>
      </main>
    </AuthGate>
  );
}
