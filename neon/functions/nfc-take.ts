import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

attachDatabasePool(pool);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-med-track-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "POST only" },
      { status: 405, headers: cors },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: unknown;
      timezone?: unknown;
    };
    const token =
      (typeof body.token === "string" && body.token) ||
      request.headers.get("x-med-track-token") ||
      "";
    const timezone =
      typeof body.timezone === "string" && body.timezone
        ? body.timezone
        : "America/Chicago";

    if (token.trim().length < 20) {
      return Response.json(
        { ok: false, error: "Missing token" },
        { status: 401, headers: cors },
      );
    }

    const { rows } = await pool.query<{ result: Record<string, unknown> }>(
      "SELECT public.take_dose_by_nfc_token($1, $2) AS result",
      [token.trim(), timezone],
    );
    const result = rows[0]?.result ?? {};
    const status = typeof result.status === "string" ? result.status : "error";
    const deducted = Array.isArray(result.deducted) ? result.deducted : [];
    const names = deducted
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        typeof item.name === "string"
          ? item.name
          : "",
      )
      .filter(Boolean)
      .join(", ");

    const message =
      status === "ok"
        ? names
          ? `Took: ${names}`
          : "Dose recorded"
        : typeof result.message === "string"
          ? result.message
          : "Could not record dose";

    return Response.json(
      { ok: status === "ok", status, message, result },
      { headers: cors },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not record dose";
    const invalidToken = message.includes("Invalid NFC token");
    return Response.json(
      { ok: false, error: invalidToken ? "Invalid token" : message },
      { status: invalidToken ? 401 : 500, headers: cors },
    );
  }
}
