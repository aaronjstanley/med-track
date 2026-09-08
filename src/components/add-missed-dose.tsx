"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, timeInputValue } from "@/lib/format";
import type { TakeDoseResult } from "@/lib/types";

type Props = {
  onAdded: () => void;
};

function localDateInputValue(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AddMissedDose({ onAdded }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [doseDate, setDoseDate] = useState(localDateInputValue);
  const [scheduledTime, setScheduledTime] = useState("");
  const [takenAt, setTakenAt] = useState("");

  const loadSlots = useCallback(async () => {
    setLoadingSlots(true);
    const { data, error: err } = await supabase
      .from("schedule_entries")
      .select("scheduled_time")
      .order("scheduled_time");

    if (err) {
      setError(err.message);
      setSlots([]);
      setLoadingSlots(false);
      return;
    }

    const unique = [...new Set((data ?? []).map((row) => row.scheduled_time))];
    setSlots(unique);
    setScheduledTime((prev) =>
      prev && unique.includes(prev) ? prev : (unique[0] ?? ""),
    );
    setLoadingSlots(false);
  }, [supabase]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!doseDate || !scheduledTime) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    const time =
      scheduledTime.length === 5 ? `${scheduledTime}:00` : scheduledTime;

    const args: {
      p_dose_date: string;
      p_scheduled_time: string;
      p_taken_at?: string;
    } = {
      p_dose_date: doseDate,
      p_scheduled_time: time,
    };
    if (takenAt) {
      args.p_taken_at = new Date(takenAt).toISOString();
    }

    const { data, error: err } = await supabase.rpc("log_dose_for_slot", args);

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }

    const result = data as TakeDoseResult;
    if (result.status === "ok") {
      setSuccess(
        `Logged ${formatTime(result.scheduled_time)} dose for ${result.dose_date}.`,
      );
      setDoseDate(localDateInputValue());
      setTakenAt("");
      onAdded();
    } else if (result.status === "already_taken") {
      setError(result.message);
    } else if (result.status === "no_slot" || result.status === "invalid") {
      setError(result.message);
    } else {
      setError("Could not log that dose.");
    }

    setBusy(false);
  }

  if (loadingSlots) {
    return null;
  }

  if (slots.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
        Add medicines to your schedule before logging missed doses.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      {!open ? (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            setOpen(true);
            setError(null);
            setSuccess(null);
          }}
        >
          Add missed dose
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-[var(--ink)]">
              Log a forgotten dose
            </p>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-[var(--muted)]">
            Pick the day and scheduled slot. Inventory counts will be reduced
            like a normal dose.
          </p>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Date
            </span>
            <input
              type="date"
              className="field"
              value={doseDate}
              max={localDateInputValue()}
              required
              onChange={(e) => setDoseDate(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              Scheduled slot
            </span>
            <select
              className="field"
              value={timeInputValue(scheduledTime)}
              required
              onChange={(e) => setScheduledTime(e.target.value)}
            >
              {slots.map((slot) => (
                <option key={slot} value={timeInputValue(slot)}>
                  {formatTime(slot)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
              When taken (optional)
            </span>
            <input
              type="datetime-local"
              className="field"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
            />
          </label>

          {error ? (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          {success ? (
            <p className="rounded-md bg-[var(--warn-soft)] px-3 py-2 text-sm text-[var(--warn)]">
              {success}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Logging…" : "Log dose"}
          </button>
        </form>
      )}
    </div>
  );
}
