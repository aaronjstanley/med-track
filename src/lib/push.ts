import webpush from "web-push";
import type { LowStockMedicine } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:medtrack@localhost";

  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendLowStockPush(items: LowStockMedicine[]) {
  if (!items.length) return;

  configureWebPush();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subs?.length) return;

  const body =
    items.length === 1
      ? `Time to reorder ${items[0].name} (${items[0].remaining_count} left)`
      : `Time to reorder: ${items.map((i) => `${i.name} (${i.remaining_count})`).join(", ")}`;

  const payload = JSON.stringify({
    title: "Med Track — reorder soon",
    body,
    url: "/",
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err: unknown) {
        const statusCode =
          typeof err === "object" && err && "statusCode" in err
            ? Number((err as { statusCode: number }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
}
