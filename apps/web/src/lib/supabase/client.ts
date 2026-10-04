"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key only — never the service role). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
