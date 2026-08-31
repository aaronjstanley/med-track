"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatTime, timeInputValue } from "@/lib/format";
import type { Medicine, ScheduleEntry } from "@/lib/types";

type Props = {
  medicines: Medicine[];
  schedule: ScheduleEntry[];
};

export function ScheduleEditor({
  medicines,
  schedule: initialSchedule,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [schedule, setSchedule] = useState(initialSchedule);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [schedMedId, setSchedMedId] = useState(medicines[0]?.id ?? "");
  const [schedTime, setSchedTime] = useState("08:00");
  const [editingSched, setEditingSched] = useState<ScheduleEntry | null>(null);

  async function saveSchedule(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setBusy(false);
      return;
    }

    const time = schedTime.length === 5 ? `${schedTime}:00` : schedTime;

    if (editingSched) {
      const { data, error: err } = await supabase
        .from("schedule_entries")
        .update({
          medicine_id: schedMedId,
          scheduled_time: time,
        })
        .eq("id", editingSched.id)
        .select("*, medicines(id, name, remaining_count)")
        .single();
      if (err) setError(err.message);
      else {
        setSchedule((prev) =>
          prev.map((s) => (s.id === data.id ? (data as ScheduleEntry) : s)),
        );
        setEditingSched(null);
      }
    } else {
      const maxOrder = schedule.reduce((max, s) => Math.max(max, s.sort_order), -1);
      const { data, error: err } = await supabase
        .from("schedule_entries")
        .insert({
          user_id: user.id,
          medicine_id: schedMedId,
          scheduled_time: time,
          sort_order: maxOrder + 1,
        })
        .select("*, medicines(id, name, remaining_count)")
        .single();
      if (err) setError(err.message);
      else {
        setSchedule((prev) => [...prev, data as ScheduleEntry]);
      }
    }
    setBusy(false);
  }

  function startEditSched(s: ScheduleEntry) {
    setEditingSched(s);
    setSchedMedId(s.medicine_id);
    setSchedTime(timeInputValue(s.scheduled_time));
  }

  async function deleteSched(id: string) {
    if (!confirm("Remove this schedule entry?")) return;
    setBusy(true);
    const { error: err } = await supabase
      .from("schedule_entries")
      .delete()
      .eq("id", id);
    if (err) setError(err.message);
    else setSchedule((prev) => prev.filter((s) => s.id !== id));
    setBusy(false);
  }

  async function moveSched(id: string, direction: -1 | 1) {
    const sorted = [...schedule].sort((a, b) => {
      if (a.scheduled_time === b.scheduled_time) {
        return a.sort_order - b.sort_order;
      }
      return a.scheduled_time.localeCompare(b.scheduled_time);
    });
    const idx = sorted.findIndex((s) => s.id === id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    const aOrder = a.sort_order;
    const bOrder = b.sort_order;

    setBusy(true);
    const { error: err1 } = await supabase
      .from("schedule_entries")
      .update({ sort_order: bOrder })
      .eq("id", a.id);
    const { error: err2 } = await supabase
      .from("schedule_entries")
      .update({ sort_order: aOrder })
      .eq("id", b.id);

    if (err1 || err2) {
      setError(err1?.message ?? err2?.message ?? "Reorder failed");
    } else {
      setSchedule((prev) =>
        prev.map((s) => {
          if (s.id === a.id) return { ...s, sort_order: bOrder };
          if (s.id === b.id) return { ...s, sort_order: aOrder };
          return s;
        }),
      );
    }
    setBusy(false);
  }

  const sortedSchedule = [...schedule].sort((a, b) => {
    if (a.scheduled_time === b.scheduled_time) {
      return a.sort_order - b.sort_order;
    }
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-[var(--muted)]">
        Order doses by time. Reorder within the list for the same timeslot.
      </p>

      <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {sortedSchedule.length === 0 ? (
          <li className="py-4 text-sm text-[var(--muted)]">No schedule yet.</li>
        ) : (
          sortedSchedule.map((s, i) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium text-[var(--ink)]">
                  {s.medicines?.name ?? "Medicine"}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {formatTime(s.scheduled_time)}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || i === 0}
                  onClick={() => moveSched(s.id, -1)}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || i === sortedSchedule.length - 1}
                  onClick={() => moveSched(s.id, 1)}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => startEditSched(s)}
                  disabled={busy}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost text-[var(--danger)]"
                  onClick={() => deleteSched(s.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={saveSchedule} className="mt-4 space-y-3">
        <p className="text-sm font-medium text-[var(--ink)]">
          {editingSched ? "Edit schedule entry" : "Add schedule entry"}
        </p>
        {medicines.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Add a medicine first before scheduling.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
                <span className="text-[var(--muted)]">Medicine</span>
                <select
                  className="field"
                  required
                  value={schedMedId}
                  onChange={(e) => setSchedMedId(e.target.value)}
                >
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
                <span className="text-[var(--muted)]">Time</span>
                <input
                  className="field"
                  type="time"
                  required
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={busy}>
                {editingSched ? "Save" : "Add"}
              </button>
              {editingSched ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingSched(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </>
        )}
      </form>
    </div>
  );
}
