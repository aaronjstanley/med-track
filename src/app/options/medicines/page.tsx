"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuthGate } from "@/components/auth-gate";
import { MedicinesEditor } from "@/components/medicines-editor";
import { createClient } from "@/lib/supabase/client";
import type { Medicine } from "@/lib/types";

function MedicinesPageContent() {
  const [medicines, setMedicines] = useState<Medicine[] | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("medicines").select("*").order("name");
    setMedicines((data ?? []) as Medicine[]);
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
          Medicines
        </h1>
      </header>

      {medicines ? (
        <MedicinesEditor medicines={medicines} />
      ) : (
        <p className="text-[var(--muted)]">Loading…</p>
      )}
    </main>
  );
}

export default function MedicinesPage() {
  return (
    <AuthGate>
      <MedicinesPageContent />
    </AuthGate>
  );
}
