"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { AuthGate } from "@/components/auth-gate";
import { createClient as createNeonClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

const LEGACY_SUPABASE_URL = "https://ltryvlcrnjdfjyqcufgq.supabase.co";
const LEGACY_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0cnl2bGNybmpkZmp5cWN1ZmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjMxMzMsImV4cCI6MjEwMzY5OTEzM30.LH6bRpOej4QTwdwhMzqAK-195VLsr6HpqtDrNd5w8Qk";

type Tables = Database["public"]["Tables"];
type Medicine = Tables["medicines"]["Row"];
type ScheduleEntry = Tables["schedule_entries"]["Row"];
type DoseLog = Tables["dose_logs"]["Row"];
type PushSubscription = Tables["push_subscriptions"]["Row"];
type Profile = Tables["profiles"]["Row"];

type MigrationCounts = {
  medicines: number;
  schedule: number;
  doses: number;
  subscriptions: number;
};

const emptyCounts: MigrationCounts = {
  medicines: 0,
  schedule: 0,
  doses: 0,
  subscriptions: 0,
};

function MigrationTool() {
  const neon = useMemo(() => createNeonClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<MigrationCounts | null>(null);

  async function migrate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCounts(null);

    const source = createSupabaseClient(
      LEGACY_SUPABASE_URL,
      LEGACY_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    try {
      const {
        data: { user: neonUser },
        error: neonUserError,
      } = await neon.auth.getUser();
      if (neonUserError || !neonUser) {
        throw new Error("Your Neon session expired. Sign in again first.");
      }

      const [
        existingMedicines,
        existingSchedule,
        existingDoses,
      ] = await Promise.all([
        neon.from("medicines").select("id", { count: "exact", head: true }),
        neon
          .from("schedule_entries")
          .select("id", { count: "exact", head: true }),
        neon.from("dose_logs").select("id", { count: "exact", head: true }),
      ]);

      const destinationError =
        existingMedicines.error ??
        existingSchedule.error ??
        existingDoses.error;
      if (destinationError) throw destinationError;

      if (
        (existingMedicines.count ?? 0) > 0 ||
        (existingSchedule.count ?? 0) > 0 ||
        (existingDoses.count ?? 0) > 0
      ) {
        throw new Error(
          "This Neon account already contains MedTrack data. Migration stopped to avoid duplicates.",
        );
      }

      const { error: signInError } = await source.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        throw new Error(
          "Could not sign in to the old Supabase account. Check the email and password.",
        );
      }

      const [
        profilesResult,
        medicinesResult,
        scheduleResult,
        dosesResult,
        subscriptionsResult,
      ] = await Promise.all([
        source.from("profiles").select("*").limit(1),
        source.from("medicines").select("*").order("created_at"),
        source.from("schedule_entries").select("*").order("created_at"),
        source.from("dose_logs").select("*").order("taken_at"),
        source.from("push_subscriptions").select("*").order("created_at"),
      ]);

      const sourceError =
        profilesResult.error ??
        medicinesResult.error ??
        scheduleResult.error ??
        dosesResult.error ??
        subscriptionsResult.error;
      if (sourceError) throw sourceError;

      const profile = (profilesResult.data?.[0] ?? null) as Profile | null;
      const medicines = (medicinesResult.data ?? []) as Medicine[];
      const schedule = (scheduleResult.data ?? []) as ScheduleEntry[];
      const doses = (dosesResult.data ?? []) as DoseLog[];
      const subscriptions = (subscriptionsResult.data ??
        []) as PushSubscription[];

      if (profile) {
        const { error: profileError } = await neon.from("profiles").upsert(
          {
            id: neonUser.id,
            timezone: profile.timezone,
          },
          { onConflict: "id" },
        );
        if (profileError) throw profileError;
      }

      if (medicines.length > 0) {
        const { error: medicinesError } = await neon
          .from("medicines")
          .upsert(
            medicines.map((medicine) => ({
              ...medicine,
              user_id: neonUser.id,
            })),
            { onConflict: "id" },
          );
        if (medicinesError) throw medicinesError;
      }

      if (schedule.length > 0) {
        const { error: scheduleError } = await neon
          .from("schedule_entries")
          .upsert(
            schedule.map((entry) => ({
              ...entry,
              user_id: neonUser.id,
            })),
            { onConflict: "id" },
          );
        if (scheduleError) throw scheduleError;
      }

      if (doses.length > 0) {
        const { error: dosesError } = await neon.from("dose_logs").upsert(
          doses.map((dose) => ({
            ...dose,
            user_id: neonUser.id,
          })),
          { onConflict: "id" },
        );
        if (dosesError) throw dosesError;
      }

      if (subscriptions.length > 0) {
        const { error: subscriptionsError } = await neon
          .from("push_subscriptions")
          .upsert(
            subscriptions.map((subscription) => ({
                ...subscription,
                user_id: neonUser.id,
              })),
            { onConflict: "user_id,endpoint" },
          );
        if (subscriptionsError) throw subscriptionsError;
      }

      const [medicinesCheck, scheduleCheck, dosesCheck, subscriptionsCheck] =
        await Promise.all([
          neon.from("medicines").select("id", { count: "exact", head: true }),
          neon
            .from("schedule_entries")
            .select("id", { count: "exact", head: true }),
          neon.from("dose_logs").select("id", { count: "exact", head: true }),
          neon
            .from("push_subscriptions")
            .select("id", { count: "exact", head: true }),
        ]);

      const verifyError =
        medicinesCheck.error ??
        scheduleCheck.error ??
        dosesCheck.error ??
        subscriptionsCheck.error;
      if (verifyError) throw verifyError;

      const imported = {
        medicines: medicinesCheck.count ?? 0,
        schedule: scheduleCheck.count ?? 0,
        doses: dosesCheck.count ?? 0,
        subscriptions: subscriptionsCheck.count ?? 0,
      };
      const expected = {
        medicines: medicines.length,
        schedule: schedule.length,
        doses: doses.length,
        subscriptions: subscriptions.length,
      };

      if (
        imported.medicines !== expected.medicines ||
        imported.schedule !== expected.schedule ||
        imported.doses !== expected.doses ||
        imported.subscriptions !== expected.subscriptions
      ) {
        throw new Error(
          "The import finished, but verification counts did not match. Do not run it again; contact support to inspect the rows.",
        );
      }

      setCounts(imported);
      setPassword("");
    } catch (migrationError) {
      setError(
        migrationError instanceof Error
          ? migrationError.message
          : "Migration failed",
      );
    } finally {
      await source.auth.signOut().catch(() => undefined);
      setBusy(false);
    }
  }

  const summary = counts ?? emptyCounts;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-7">
        <Link href="/options" className="text-sm text-[var(--accent)]">
          ← Options
        </Link>
        <h1 className="font-display mt-2 text-3xl tracking-tight text-[var(--ink)]">
          Move your data
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Sign in to your old Supabase account once. MedTrack will copy its
          medicines, schedule, and dose history into your current Neon account.
        </p>
      </header>

      {counts ? (
        <section className="space-y-5">
          <div className="rounded-lg bg-[var(--surface)] px-4 py-4">
            <p className="font-medium text-[var(--ink)]">Migration complete</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Medicines</dt>
                <dd className="mt-0.5 tabular-nums text-[var(--ink)]">
                  {summary.medicines}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Schedule entries</dt>
                <dd className="mt-0.5 tabular-nums text-[var(--ink)]">
                  {summary.schedule}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Dose logs</dt>
                <dd className="mt-0.5 tabular-nums text-[var(--ink)]">
                  {summary.doses}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Push subscriptions</dt>
                <dd className="mt-0.5 tabular-nums text-[var(--ink)]">
                  {summary.subscriptions}
                </dd>
              </div>
            </dl>
          </div>
          <Link href="/" className="btn-primary w-full">
            Review your medicines
          </Link>
        </section>
      ) : (
        <form onSubmit={migrate} className="space-y-4">
          <div className="rounded-lg bg-[var(--surface)] px-4 py-4">
            <p className="text-sm font-medium text-[var(--ink)]">
              Old Supabase login
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              Your password is sent directly to Supabase over HTTPS and is
              never saved by MedTrack.
            </p>

            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--muted)]">Email</span>
              <input
                className="field"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--muted)]">Password</span>
              <input
                className="field"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? "Moving and verifying data…" : "Move data to Neon"}
          </button>
        </form>
      )}
    </main>
  );
}

export default function MigratePage() {
  return (
    <AuthGate>
      <MigrationTool />
    </AuthGate>
  );
}
