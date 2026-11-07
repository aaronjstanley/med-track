"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { NfcTokenSync } from "@/components/nfc-token-sync";

type AuthUser = { id: string };

export function AuthGate({
  children,
  requireAuth = true,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();

    void supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user === undefined) return;

    if (requireAuth && !user) {
      const next =
        pathname && pathname !== "/"
          ? `?next=${encodeURIComponent(pathname)}`
          : "";
      router.replace(`/login${next}`);
      return;
    }

    if (!requireAuth && user && pathname === "/login") {
      router.replace("/");
    }
  }, [user, requireAuth, router, pathname]);

  if (user === undefined) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 items-center justify-center px-5 py-12">
        <p className="text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  if (requireAuth && !user) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 items-center justify-center px-5 py-12">
        <p className="text-[var(--muted)]">Redirecting to sign in…</p>
      </main>
    );
  }

  if (!requireAuth && user && pathname === "/login") {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-lg flex-1 items-center justify-center px-5 py-12">
        <p className="text-[var(--muted)]">Redirecting…</p>
      </main>
    );
  }

  return (
    <>
      {user ? <NfcTokenSync /> : null}
      {children}
    </>
  );
}
