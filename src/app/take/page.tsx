import Link from "next/link";
import { TakeButton } from "@/components/take-button";

export default function TakePage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-10">
      <h1 className="font-display text-3xl tracking-tight text-[var(--ink)]">
        Taking dose
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Checking the current schedule for your time…
      </p>

      <TakeButton autoRun className="mt-8" />

      <Link
        href="/"
        className="mt-10 text-center text-sm font-medium text-[var(--accent)]"
      >
        Back to home
      </Link>
    </main>
  );
}
