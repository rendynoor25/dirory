import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { PLUGIN_VERSION } from "@/lib/pluginRelease";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe (brief §120). Used by the Docker HEALTHCHECK, the
 * deploy script and Caddy. Deliberately cheap: it does not touch the database,
 * so a Supabase blip does not make the container look dead. It reports whether
 * the app is configured and which plugin version it publishes.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      app: "dirory-web",
      plugin_version: PLUGIN_VERSION,
      supabase_configured: isSupabaseConfigured(),
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
