"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AddMissedDose } from "@/components/add-missed-dose";
import { formatTime } from "@/lib/format";
import type { DoseLog } from "@/lib/types";

function formatSource(source: DoseLog["source"]): string {
  if (source === "nfc") return "NFC";
  if (source === "manual") return "Manual";
  return "Button";
}

function formatTakenAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DoseLogList() {
  const [logs, setLogs] = useState<DoseLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("dose_logs")
      .select("*")
      .order("taken_at", { ascending: false })
      .limit(200);

    if (err) {
      setError(err.message);
      setLogs([]);
      return;
    }

    setError(null);
    setLogs((data ?? []) as DoseLog[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function undoBatch(logId: string) {
    if (
      !confirm(
        "Delete this whole batch? Counts for each medicine in it will be restored by 1.",
      )
    ) {
      return;
    }
    setBusyId(logId);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("undo_dose_batch", {
      p_log_id: logId,
    });
    if (err) setError(err.message);
    else await load();
    setBusyId(null);
  }

  async function undoMedicine(logId: string, medicineId: string, name: string) {
    if (
      !confirm(
        `Remove ${name} from this batch and add 1 back to its count?`,
      )
    ) {
      return;
    }
    setBusyId(`${logId}:${medicineId}`);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("undo_dose_medicine", {
      p_log_id: logId,
      p_medicine_id: medicineId,
    });
    if (err) setError(err.message);
    else await load();
    setBusyId(null);
  }

  if (logs === null) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  return (
    <div>
      <p className="text-sm text-[var(--muted)]">
        Doses grouped by when they were taken. Deleting restores inventory
        counts.
      </p>

      <AddMissedDose onAdded={load} />

      {error ? (
        <p className="mt-4 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {logs.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">No doses logged yet.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {logs.map((log) => {
            const meds =
              Array.isArray(log.medicines_taken) && log.medicines_taken.length > 0
                ? log.medicines_taken
                : [];
            const batchBusy = busyId === log.id;

            return (
              <li
                key={log.id}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {formatTakenAt(log.taken_at)}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      Scheduled {formatTime(log.scheduled_time)}
                      {" · "}
                      {formatSource(log.source)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost text-[var(--danger)]"
                    disabled={busyId !== null}
                    onClick={() => undoBatch(log.id)}
                  >
                    {batchBusy ? "…" : "Delete batch"}
                  </button>
                </div>

                <ul className="mt-3 divide-y divide-[var(--line)] border-t border-[var(--line)]">
                  {meds.length === 0 ? (
                    <li className="py-2 text-sm text-[var(--muted)]">
                      No medicine details stored for this batch.
                    </li>
                  ) : (
                    meds.map((med, index) => {
                      const itemBusy = busyId === `${log.id}:${med.id}`;
                      return (
                        <li
                          key={`${log.id}-${med.id}-${index}`}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="text-[var(--ink)]">{med.name}</span>
                          <button
                            type="button"
                            className="btn-ghost text-[var(--danger)]"
                            disabled={busyId !== null || med.id === "unknown"}
                            onClick={() => undoMedicine(log.id, med.id, med.name)}
                          >
                            {itemBusy ? "…" : "Delete"}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
