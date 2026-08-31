"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createNfcToken,
  getStoredNfcToken,
  storeNfcToken,
} from "@/lib/nfc-token";

/**
 * When the user is signed in (in this browser), ensure a personal NFC token
 * exists server-side and is cached in localStorage so /take/ can run without
 * a session after an NFC scan opens Safari.
 */
export function NfcTokenSync() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const existing = getStoredNfcToken();
      if (existing) {
        // Keep server hash aligned with the local token Safari will use.
        await supabase.rpc("rotate_nfc_token", { p_token: existing });
        return;
      }

      const token = createNfcToken();
      const { error } = await supabase.rpc("rotate_nfc_token", {
        p_token: token,
      });
      if (!error) storeNfcToken(token);
    })();
  }, []);

  return null;
}
