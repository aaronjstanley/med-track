import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-med-track-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token =
      (typeof body?.token === "string" && body.token) ||
      req.headers.get("x-med-track-token") ||
      "";
    const timezone =
      (typeof body?.timezone === "string" && body.timezone) ||
      "America/Chicago";

    if (!token || token.trim().length < 20) {
      return new Response(JSON.stringify({ ok: false, error: "Missing token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );

    const { data, error } = await supabase.rpc("take_dose_by_nfc_token", {
      p_token: token.trim(),
      p_timezone: timezone,
    });

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        {
          status: 400,
          headers: { ...cors, "Content-Type": "application/json" },
        },
      );
    }

    const result = data as {
      status?: string;
      message?: string;
      scheduled_time?: string;
      deducted?: { name: string; remaining_count: number }[];
    };

    let message = "Done";
    if (result.status === "ok") {
      const names = (result.deducted ?? []).map((m) => m.name).join(", ");
      message = names ? `Took: ${names}` : "Dose recorded";
    } else if (result.status === "already_taken") {
      message = result.message ?? "Already taken";
    } else if (result.status === "no_slot") {
      message = result.message ?? "No dose scheduled yet";
    }

    return new Response(
      JSON.stringify({
        ok: result.status === "ok",
        status: result.status,
        message,
        result,
      }),
      {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
