import { redirect } from "next/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { approveDevice } from "./actions";
import { DeviceSignIn } from "./DeviceSignIn";
import { googleEnabled } from "@/lib/providers";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { OccupationPicker } from "@/components/OccupationPicker";

const DEVICE_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * FR-A4 (M6) — the browser half of the SketchUp device-code login.
 *
 * The plugin opens this page with `?code=ABCD-EFGH`.
 *
 * This page is deliberately SELF-CONTAINED: when the visitor is not signed in it
 * renders its own sign-in (Google + email) right here instead of bouncing to
 * `/login?next=/auth/device?code=...`. That earlier redirect chain lost the code
 * across an OAuth round-trip and, on a preview host, broke entirely. Keeping the
 * code on this page means the whole flow stays on one URL.
 *
 * Once signed in the code is approved automatically and the page tells the user
 * to return to SketchUp.
 */
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[]; status?: string; error?: string }>;
}) {
  const params = await searchParams;
  // `code` can arrive twice (`?code=ABCD-EFGH&code=<oauth code>`) when an OAuth
  // provider returns here directly. Pick the value shaped like a device code
  // instead of crashing on an array.
  const codes = (Array.isArray(params.code) ? params.code : [params.code ?? ""]).map((c) =>
    c.trim().toUpperCase(),
  );
  const code = codes.find((c) => DEVICE_CODE_RE.test(c)) ?? codes[0] ?? "";
  let status = params.status;

  if (!isSupabaseConfigured()) {
    return (
      <Main code={code}>
        <Notice tone="error">
          Account sign-in is temporarily unavailable. Please try again shortly.
        </Notice>
      </Main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const locale = await getLocale();

  // Not signed in: show the sign-in form here, preserving the code.
  if (!user) {
    const withGoogle = await googleEnabled();
    return (
      <Main code={code}>
        <DeviceSignIn code={code} googleEnabled={withGoogle} error={params.error} />
      </Main>
    );
  }

  // Most people sign in from the plugin, so this page also asks the one-time
  // "what best describes you?" question — the answer is what the admin
  // dashboard reports as the architect / designer / student mix.
  const { data: profile } = await supabase
    .from("profiles")
    .select("occupation")
    .eq("id", user.id)
    .maybeSingle();
  const needsOccupation = !profile?.occupation;

  // Signed in: approve a live pending code (auto-approve — no extra click).
  if (!status && DEVICE_CODE_RE.test(code)) {
    const { data } = await supabase
      .from("plugin_device_codes")
      .update({ status: "approved", profile_id: user.id, approved_at: new Date().toISOString() })
      .eq("user_code", code)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("user_code");
    status = data && data.length > 0 ? "approved" : "invalid";
  }

  if (status === "approved") {
    return (
      <Main code={code}>
        <Notice tone="ok">
          <strong>You&apos;re signed in.</strong> Now go back to SketchUp — the Dirory panel
          finishes signing in by itself and your name appears in the top-right corner.
        </Notice>

        {needsOccupation ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">
              {t(locale, "welcome.tag")}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{t(locale, "welcome.title")}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t(locale, "welcome.lead")}</p>
            <div className="mt-4">
              <OccupationPicker locale={locale} compact />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">You can close this browser tab.</p>
        )}
      </Main>
    );
  }

  if (status === "invalid") {
    return (
      <Main code={code}>
        <Notice tone="error">
          This code is not valid any more. Go back to SketchUp, click your account
          button and start the sign-in again.
        </Notice>
      </Main>
    );
  }

  // Signed in but the flow was opened without a usable code.
  return (
    <Main code={code}>
      <Notice tone="error">
        This page needs the code shown in SketchUp. Go back to SketchUp, click your
        account button and use &ldquo;Sign in with browser&rdquo;.
      </Notice>
    </Main>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "ok"
      ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
      : "rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700";
  return <p className={cls}>{children}</p>;
}

function Main({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Connect SketchUp</h1>
        {code ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Device code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-slate-900">{code}</p>
          </div>
        ) : null}
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}
