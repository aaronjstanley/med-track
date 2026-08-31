"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { ScheduleEditor } from "@/components/schedule-editor";
import { createClient } from "@/lib/supabase/client";
import type { Medicine, ScheduleEntry } from "@/lib/types";

function SchedulePageContent() {
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

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-sm text-[var(--muted)]">
          <Link href="/options" className="text-[var(--accent)]">
            ← Options
          </Link>
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight text-[var(--ink)]">
          Schedule
        </h1>
      </header>

      {medicines && schedule ? (
        <ScheduleEditor medicines={medicines} schedule={schedule} />
      ) : (
        <p className="text-[var(--muted)]">Loading…</p>
      )}
    </main>
  );
}

export default function SchedulePage() {
  return (
    <AuthGate>
      <SchedulePageContent />
    </AuthGate>
  );
}
