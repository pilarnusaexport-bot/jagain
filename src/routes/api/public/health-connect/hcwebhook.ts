import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Payload shape produced by the "Health Connect to Webhook" Android app
// (github.com/mcnaveen/health-connect-webhook), JSON delivery mode.
const payloadSchema = z.object({
  timestamp: z.string().optional(),
  app_version: z.string().optional(),
  steps: z
    .array(z.object({ count: z.number().finite().nonnegative(), start_time: z.string(), end_time: z.string().optional() }))
    .optional(),
  sleep: z
    .array(z.object({ session_end_time: z.string(), duration_seconds: z.number().finite().nonnegative() }))
    .optional(),
  heart_rate: z
    .array(
      z.object({
        time: z.string(),
        bpm: z.number().finite().nonnegative().optional(),
        avg: z.number().finite().nonnegative().optional(),
      }),
    )
    .optional(),
});

type Payload = z.infer<typeof payloadSchema>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Health Connect timestamps are instants; buckets must follow the phone's local
// calendar day, not UTC, otherwise early-morning records land on the previous day.
const DEFAULT_OFFSET_MINUTES = 7 * 60; // Asia/Jakarta

function offsetMinutes(iso: string): number {
  const match = iso.match(/([+-])(\d{2}):?(\d{2})$/);
  if (!match) return DEFAULT_OFFSET_MINUTES; // "Z" or naive strings
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function dayKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + offsetMinutes(iso) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

type Row = { metric_type: string; value: number; unit: string; recorded_at: string; source: string };

function buildRows(payload: Payload): Row[] {
  const steps = new Map<string, number>();
  const sleep = new Map<string, number>();
  const heart = new Map<string, { sum: number; count: number }>();

  for (const record of payload.steps ?? []) {
    const key = dayKey(record.start_time);
    if (key) steps.set(key, (steps.get(key) ?? 0) + record.count);
  }
  for (const record of payload.sleep ?? []) {
    const key = dayKey(record.session_end_time);
    if (key) sleep.set(key, (sleep.get(key) ?? 0) + record.duration_seconds / 60);
  }
  for (const record of payload.heart_rate ?? []) {
    const key = dayKey(record.time);
    const bpm = record.avg ?? record.bpm;
    if (!key || bpm === undefined) continue;
    const bucket = heart.get(key) ?? { sum: 0, count: 0 };
    heart.set(key, { sum: bucket.sum + bpm, count: bucket.count + 1 });
  }

  const rows: Row[] = [];
  const at = (key: string) => `${key}T00:00:00.000Z`;
  for (const [key, value] of steps) {
    rows.push({ metric_type: "steps", value: Math.round(value), unit: "langkah", recorded_at: at(key), source: "health_connect_webhook" });
  }
  for (const [key, value] of sleep) {
    rows.push({ metric_type: "sleep", value: Math.round(value), unit: "menit", recorded_at: at(key), source: "health_connect_webhook" });
  }
  for (const [key, bucket] of heart) {
    rows.push({ metric_type: "heart_rate", value: Math.round(bucket.sum / bucket.count), unit: "bpm", recorded_at: at(key), source: "health_connect_webhook" });
  }
  return rows;
}

export const Route = createFileRoute("/api/public/health-connect/hcwebhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // The companion app may not support custom headers, so accept the pairing
        // token from several places: Authorization, x-api-key/api-key/token headers,
        // or a query string param.
        const url = new URL(request.url);
        const auth = request.headers.get("authorization") ?? "";
        const candidates = [
          auth.replace(/^(Bearer|Token)\s+/i, ""),
          request.headers.get("x-api-key") ?? "",
          request.headers.get("api-key") ?? "",
          request.headers.get("x-pair-token") ?? "",
          request.headers.get("token") ?? "",
          url.searchParams.get("token") ?? "",
          url.searchParams.get("key") ?? "",
        ];
        const token = candidates
          .map((value) => (value.match(/[a-f0-9]{48}/i)?.[0] ?? "").toLowerCase())
          .find((value) => value.length === 48) ?? "";

        if (!token) {
          console.error(
            `HC Webhook missing token. headers=${JSON.stringify(
              Object.fromEntries([...request.headers].filter(([k]) => !/cookie/i.test(k))),
            )} query=${url.search}`,
          );
          return json({ error: "invalid_pair_token", hint: "Kirim kode pemasangan lewat header x-api-key atau ?token= di URL." }, 401);
        }

        let payload: Payload;
        try {
          payload = payloadSchema.parse(await request.json());
        } catch (error) {
          return json({ error: "invalid_payload", detail: String(error) }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: link, error: linkError } = await supabaseAdmin
          .from("health_device_links")
          .select("id, user_id")
          .eq("pair_token", token)
          .maybeSingle();

        if (linkError) {
          console.error(`HC Webhook lookup failed: ${linkError.message}`);
          return json({ error: "lookup_failed" }, 500);
        }
        if (!link) return json({ error: "invalid_pair_token" }, 401);

        const rows = buildRows(payload);

        if (rows.length > 0) {
          const { error: upsertError } = await supabaseAdmin.from("health_records").upsert(
            rows.map((row) => ({ ...row, user_id: link.user_id })),
            { onConflict: "user_id,metric_type,recorded_at" },
          );
          if (upsertError) {
            console.error(`HC Webhook upsert failed: ${upsertError.message}`);
            return json({ error: "sync_failed", detail: upsertError.message }, 500);
          }
        }

        await supabaseAdmin
          .from("health_device_links")
          .update({
            status: "connected",
            last_sync_at: new Date().toISOString(),
            device_name: "Health Connect Webhook",
          })
          .eq("id", link.id);

        return json({ ok: true, stored: rows.length });
      },
    },
  },
});
