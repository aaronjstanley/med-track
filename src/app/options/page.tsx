"use client";

import Link from "next/link";
import { AuthGate } from "@/components/auth-gate";

const links = [
  {
    href: "/options/medicines",
    title: "Medicines",
    description: "Add, edit, or delete medicines and counts",
  },
  {
    href: "/options/schedule",
    title: "Schedule",
    description: "When each medicine is taken during the day",
  },
  {
    href: "/options/log",
    title: "Log",
    description: "History of doses from the button or NFC",
  },
  {
    href: "/options/nfc",
    title: "NFC",
    description: "One-tap Shortcuts setup (no Safari)",
  },
  {
    href: "/options/migrate",
    title: "Move data",
    description: "Copy your old Supabase data into Neon",
  },
] as const;

function OptionsMenu() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-8">
      <header className="mb-8">
        <p className="text-sm text-[var(--muted)]">
          <Link href="/" className="text-[var(--accent)]">
            ← Home
          </Link>
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight text-[var(--ink)]">
          Options
        </h1>
      </header>

      <nav>
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="flex items-center justify-between gap-4 py-4 transition hover:bg-white/40"
              >
                <span>
                  <span className="block text-lg font-medium text-[var(--ink)]">
                    {link.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--muted)]">
                    {link.description}
                  </span>
                </span>
                <span className="text-[var(--muted)]" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}

export default function OptionsPage() {
  return (
    <AuthGate>
      <OptionsMenu />
    </AuthGate>
  );
}
