import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
const WEBHOOK_SECRET = Deno.env.get("STASIS_WEBHOOK_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

type Outbox = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  room_id: string | null;
  event_type: "status" | "mood" | "availability" | "note";
  title: string;
  body: string;
  url: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
};

function inQuietHours(now: Date, timezone: string, start?: string | null, end?: string | null) {
  if (!start || !end) return false;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(now);
    const h = Number(parts.find(p => p.type === "hour")?.value || 0);
    const m = Number(parts.find(p => p.type === "minute")?.value || 0);
    const current = h * 60 + m;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return s <= e ? current >= s && current < e : current >= s || current < e;
  } catch {
    return false;
  }
}

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (WEBHOOK_SECRET && req.headers.get("x-stasis-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const hook = await req.json();
    const record = (hook.record || hook) as Partial<Outbox>;
    if (!record.id) return new Response(JSON.stringify({ ok: true, skipped: "no outbox id" }), { headers: { "content-type": "application/json" } });

    const { data: event, error: eventError } = await supabase
      .from("notification_outbox")
      .select("*")
      .eq("id", record.id)
      .maybeSingle<Outbox>();
    if (eventError) throw eventError;
    if (!event || event.processed_at) return new Response(JSON.stringify({ ok: true, skipped: "already processed" }), { headers: { "content-type": "application/json" } });

    const [{ data: subscriptions, error: subError }, { data: profile }, { data: pref }] = await Promise.all([
      supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", event.recipient_id),
      supabase.from("profiles").select("timezone").eq("id", event.recipient_id).maybeSingle(),
      event.room_id ? supabase.from("notification_preferences").select("quiet_start,quiet_end").eq("user_id", event.recipient_id).eq("room_id", event.room_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    if (subError) throw subError;

    if (inQuietHours(new Date(), profile?.timezone || "UTC", pref?.quiet_start, pref?.quiet_end)) {
      await supabase.from("notification_outbox").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
      return new Response(JSON.stringify({ ok: true, skipped: "quiet hours" }), { headers: { "content-type": "application/json" } });
    }

    const payload = JSON.stringify({
      title: event.title,
      body: event.body,
      url: event.url,
      room_id: event.room_id,
      event_type: event.event_type,
      ...event.payload
    });

    const results = await Promise.allSettled((subscriptions || []).map(async subscription => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, payload, { TTL: 1800, urgency: "normal" });
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
          return;
        }
        throw error;
      }
    }));

    await supabase.from("notification_outbox").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
    const failed = results.filter(result => result.status === "rejected").length;
    return new Response(JSON.stringify({ ok: true, sent: results.length - failed, failed }), { headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
});
