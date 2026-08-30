"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { OptionsClient } from "@/components/options-client";
import { createClient } from "@/lib/supabase/client";
import type { Medicine, ScheduleEntry } from "@/lib/types";

function OptionsContent() {
  const [medicines, setMedicines] = useState<Medicine[] | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[] | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: meds }, { data: sched }] = await Promise.all([
      supabase.from("medicines").select("*").order("name"),
      supabase
        .from("schedule_entries")
        .select("*, medicines(id, name, remaining_count)")
        .order("scheduled_time")
        .order("sort_order"),
    ]);
    setMedicines((meds ?? []) as Medicine[]);
    setSchedule((sched ?? []) as ScheduleEntry[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!medicines || !schedule) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
        <p className="text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--muted)]">
            <Link href="/" className="text-[var(--accent)]">
              ← Home
            </Link>
          </p>
          <h1 className="font-display mt-2 text-3xl tracking-tight text-[var(--ink)]">
            Options
          </h1>
        </div>
      </header>

      <OptionsClient medicines={medicines} schedule={schedule} />
    </main>
  );
}

export default function OptionsPage() {
  return (
    <AuthGate>
      <OptionsContent />
    </AuthGate>
  );
}
