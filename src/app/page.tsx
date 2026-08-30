"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { TakeButton } from "@/components/take-button";
import { PushSetup } from "@/components/push-setup";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/client";
import type { Medicine } from "@/lib/types";

function HomeContent() {
  const [list, setList] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("medicines").select("*").order("name");
    setList((data ?? []) as Medicine[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const low = list.filter((m) => m.remaining_count <= m.reorder_at);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-[var(--ink)]">
            Med Track
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">What you have left</p>
        </div>
        <div className="flex flex-col items-end gap-2 pt-1">
          <Link href="/options" className="text-sm font-medium text-[var(--accent)]">
            Options
          </Link>
          <SignOutButton />
        </div>
      </header>

      {low.length > 0 ? (
        <div className="mb-5 rounded-lg border border-[var(--warn)]/40 bg-[var(--warn-soft)] px-4 py-3 text-sm text-[var(--warn)]">
          Time to reorder: {low.map((m) => m.name).join(", ")}
        </div>
      ) : null}

      <ul className="mb-8 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {loading ? (
          <li className="py-6 text-sm text-[var(--muted)]">Loading…</li>
        ) : list.length === 0 ? (
          <li className="py-6 text-sm text-[var(--muted)]">
            No medicines yet.{" "}
            <Link
              href="/options"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Add some in Options
            </Link>
            .
          </li>
        ) : (
          list.map((m) => (
            <li
              key={m.id}
              className="flex items-baseline justify-between gap-4 py-4"
            >
              <span className="text-lg text-[var(--ink)]">{m.name}</span>
              <span
                className={`font-display text-2xl tabular-nums ${
                  m.remaining_count <= m.reorder_at
                    ? "text-[var(--warn)]"
                    : "text-[var(--ink)]"
                }`}
              >
                {m.remaining_count}
              </span>
            </li>
          ))
        )}
      </ul>

      <TakeButton onTaken={load} />

      <div className="mt-8">
        <PushSetup />
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <HomeContent />
    </AuthGate>
  );
}
