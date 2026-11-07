import { createClient as createNeonClient } from "@neon/neon-js/supabase";
import type { Database } from "@/lib/database.types";

type NeonClient = ReturnType<typeof createNeonClient<Database>>;

let client: NeonClient | null = null;

export function createClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_NEON_URL;

  if (!url) {
    throw new Error("Missing NEXT_PUBLIC_NEON_URL");
  }

  client = createNeonClient<Database>(url, {
    auth: {
      allowAnonymous: true,
    },
  });

  return client;
}
