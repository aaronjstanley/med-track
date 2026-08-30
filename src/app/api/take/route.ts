import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendLowStockPush } from "@/lib/push";
import type { TakeDoseResult } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let timezone = "America/Chicago";
  try {
    const body = await request.json();
    if (typeof body?.timezone === "string" && body.timezone.length > 0) {
      timezone = body.timezone;
    }
  } catch {
    // optional body
  }

  const { data, error } = await supabase.rpc("take_current_dose", {
    p_timezone: timezone,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = data as TakeDoseResult;

  if (result.status === "ok" && result.low_stock?.length) {
    try {
      await sendLowStockPush(result.low_stock);
    } catch {
      // Dose succeeded; push is best-effort
    }
  }

  return NextResponse.json(result);
}
