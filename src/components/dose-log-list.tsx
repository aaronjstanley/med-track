"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime } from "@/lib/format";
import type { DoseLog } from "@/lib/types";

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

type LogRow = {
  key: string;
  medicineName: string;
  takenAt: string;
  scheduledTime: string;
  source: "button" | "nfc";
};

export function DoseLogList() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const supabase = createClient();
      const { data, error: err } = await supabase
        .from("dose_logs")
        .select("*")
        .order("taken_at", { ascending: false })
        .limit(200);

      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }

      const logs = (data ?? []) as DoseLog[];
      const expanded: LogRow[] = [];
      for (const log of logs) {
        const meds =
          Array.isArray(log.medicines_taken) && log.medicines_taken.length > 0
            ? log.medicines_taken
            : [{ id: "unknown", name: "Dose", remaining_count: 0 }];
        for (const med of meds) {
          expanded.push({
            key: `${log.id}-${med.id}`,
            medicineName: med.name,
            takenAt: log.taken_at,
            scheduledTime: log.scheduled_time,
            source: log.source === "nfc" ? "nfc" : "button",
          });
        }
      }
      setRows(expanded);
    })();
  }, []);

  if (rows === null) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  return (
    <div>
      <p className="text-sm text-[var(--muted)]">
        When each medicine was taken from the home button or an NFC scan.
      </p>

      {error ? (
        <p className="mt-4 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {rows.length === 0 ? (
          <li className="py-4 text-sm text-[var(--muted)]">
            No doses logged yet.
          </li>
        ) : (
          rows.map((row) => (
            <li key={row.key} className="py-3">
              <p className="font-medium text-[var(--ink)]">{row.medicineName}</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                {formatTakenAt(row.takenAt)}
                {" · "}
                scheduled {formatTime(row.scheduledTime)}
                {" · "}
                {row.source === "nfc" ? "NFC" : "Button"}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
