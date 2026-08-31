"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Medicine } from "@/lib/types";

type Props = {
  medicines: Medicine[];
};

export function MedicinesEditor({ medicines: initialMeds }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [medicines, setMedicines] = useState(initialMeds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [medName, setMedName] = useState("");
  const [medCount, setMedCount] = useState("30");
  const [editingMed, setEditingMed] = useState<Medicine | null>(null);

  async function saveMedicine(e: FormEvent) {
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

    const payload = {
      name: medName.trim(),
      remaining_count: Math.max(0, Number(medCount) || 0),
    };

    if (editingMed) {
      const { data, error: err } = await supabase
        .from("medicines")
        .update(payload)
        .eq("id", editingMed.id)
        .select()
        .single();
      if (err) setError(err.message);
      else {
        setMedicines((prev) =>
          prev.map((m) => (m.id === data.id ? (data as Medicine) : m)),
        );
        setEditingMed(null);
        setMedName("");
        setMedCount("30");
      }
    } else {
      const { data, error: err } = await supabase
        .from("medicines")
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (err) setError(err.message);
      else {
        setMedicines((prev) => [...prev, data as Medicine]);
        setMedName("");
        setMedCount("30");
      }
    }
    setBusy(false);
  }

  function startEditMed(m: Medicine) {
    setEditingMed(m);
    setMedName(m.name);
    setMedCount(String(m.remaining_count));
  }

  async function deleteMed(id: string) {
    if (!confirm("Delete this medicine and its schedule entries?")) return;
    setBusy(true);
    const { error: err } = await supabase.from("medicines").delete().eq("id", id);
    if (err) setError(err.message);
    else {
      setMedicines((prev) => prev.filter((m) => m.id !== id));
      if (editingMed?.id === id) {
        setEditingMed(null);
        setMedName("");
        setMedCount("30");
      }
    }
    setBusy(false);
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <p className="text-sm text-[var(--muted)]">
        Add what you take and how many you have left.
      </p>

      <ul className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {medicines.length === 0 ? (
          <li className="py-4 text-sm text-[var(--muted)]">No medicines yet.</li>
        ) : (
          medicines.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium text-[var(--ink)]">{m.name}</p>
                <p className="text-sm text-[var(--muted)]">
                  {m.remaining_count} left
                  {m.remaining_count <= m.reorder_at ? " · reorder soon" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => startEditMed(m)}
                  disabled={busy}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-ghost text-[var(--danger)]"
                  onClick={() => deleteMed(m.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={saveMedicine} className="mt-4 space-y-3">
        <p className="text-sm font-medium text-[var(--ink)]">
          {editingMed ? "Edit medicine" : "Add medicine"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            <span className="text-[var(--muted)]">Name</span>
            <input
              className="field"
              required
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
            <span className="text-[var(--muted)]">Count left</span>
            <input
              className="field"
              type="number"
              min={0}
              required
              value={medCount}
              onChange={(e) => setMedCount(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {editingMed ? "Save" : "Add"}
          </button>
          {editingMed ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditingMed(null);
                setMedName("");
                setMedCount("30");
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
