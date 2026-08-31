"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LowStockMedicine, TakeDoseResult } from "@/lib/types";
import { formatTime } from "@/lib/format";

type Props = {
  className?: string;
  autoRun?: boolean;
  onTaken?: () => void;
};

async function notifyLowStock(items: LowStockMedicine[]) {
  if (!items.length) return;
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await supabase.functions.invoke("send-low-stock-push", {
      body: { items },
    });
  } catch {
    // Push is best-effort
  }
}

export function TakeButton({ className, autoRun = false, onTaken }: Props) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TakeDoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const takeDose = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const supabase = createClient();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { data, error: rpcError } = await supabase.rpc("take_current_dose", {
        p_timezone: timezone,
        p_source: autoRun ? "nfc" : "button",
      });

      if (rpcError) {
        setError(rpcError.message);
      } else {
        const takeResult = data as TakeDoseResult;
        setResult(takeResult);
        if (takeResult.status === "ok") {
          onTaken?.();
          if (takeResult.low_stock?.length) {
            void notifyLowStock(takeResult.low_stock);
          }
        }
      }
    } catch {
      setError("Could not record the dose");
    } finally {
      setBusy(false);
    }
  }, [autoRun, onTaken]);

  useEffect(() => {
    if (!autoRun || autoStarted.current) return;
    autoStarted.current = true;
    void takeDose();
  }, [autoRun, takeDose]);

  return (
    <div className={className}>
      {!autoRun ? (
        <button
          type="button"
          onClick={takeDose}
          disabled={busy}
          className="btn-primary w-full text-base"
        >
          {busy ? "Taking dose…" : "Take current medicine"}
        </button>
      ) : null}

      {busy && autoRun ? (
        <p className="text-center text-[var(--muted)]">Recording your dose…</p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {result?.status === "ok" ? (
        <div className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <p className="font-medium text-[var(--ink)]">
            Took {formatTime(result.scheduled_time)} dose
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">
            {result.deducted.map((m) => (
              <li key={m.id}>
                {m.name} → {m.remaining_count} left
              </li>
            ))}
          </ul>
          {result.low_stock.length > 0 ? (
            <p className="mt-3 text-sm font-medium text-[var(--warn)]">
              Reorder soon: {result.low_stock.map((m) => m.name).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {result?.status === "already_taken" ? (
        <p className="mt-3 rounded-md bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          Already taken for {formatTime(result.scheduled_time)} today.
        </p>
      ) : null}

      {result?.status === "no_slot" ? (
        <p className="mt-3 rounded-md bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
