import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const payloadSchema = z.object({
  device_name: z.string().min(1).max(80).optional(),
  records: z
    .array(
      z.object({
        metric_type: z.enum(["sleep", "steps", "heart_rate"]),
        value: z.number().finite().nonnegative(),
        unit: z.string().min(1).max(20),
        recorded_at: z.string().datetime(),
        source: z.string().min(1).max(40).optional(),
      }),
    )
    .min(1)
    .max(500),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/health-connect/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!/^[a-f0-9]{48}$/.test(token)) {
          return json({ error: "invalid_pair_token" }, 401);
        }

        let payload: z.infer<typeof payloadSchema>;
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
          console.error(`Health Connect sync lookup failed: ${linkError.message}`);
          return json({ error: "lookup_failed" }, 500);
        }
        if (!link) return json({ error: "invalid_pair_token" }, 401);

        const { error: upsertError } = await supabaseAdmin.from("health_records").upsert(
          payload.records.map((record) => ({
            user_id: link.user_id,
            metric_type: record.metric_type,
            value: record.value,
            unit: record.unit,
            recorded_at: record.recorded_at,
            source: record.source ?? "health_connect",
          })),
          { onConflict: "user_id,metric_type,recorded_at" },
        );

        if (upsertError) {
          console.error(`Health Connect sync upsert failed: ${upsertError.message}`);
          return json({ error: "sync_failed", detail: upsertError.message }, 500);
        }

        await supabaseAdmin
          .from("health_device_links")
          .update({
            status: "connected",
            last_sync_at: new Date().toISOString(),
            ...(payload.device_name ? { device_name: payload.device_name } : {}),
          })
          .eq("id", link.id);

        return json({ ok: true, synced: payload.records.length });
      },
    },
  },
});
