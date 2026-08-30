import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OptionsClient } from "@/components/options-client";
import type { Medicine, ScheduleEntry } from "@/lib/types";

export default async function OptionsPage() {
  const supabase = await createClient();

  const [{ data: medicines }, { data: schedule }] = await Promise.all([
    supabase.from("medicines").select("*").order("name"),
    supabase
      .from("schedule_entries")
      .select("*, medicines(id, name, remaining_count)")
      .order("scheduled_time")
      .order("sort_order"),
  ]);

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

      <OptionsClient
        medicines={(medicines ?? []) as Medicine[]}
        schedule={(schedule ?? []) as ScheduleEntry[]}
      />
    </main>
  );
}
