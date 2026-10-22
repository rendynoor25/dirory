import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { approveDevice, switchAccount } from "./actions";
import { DeviceSignIn, type DeviceApp } from "./DeviceSignIn";
import { googleClientId, googleEnabled } from "@/lib/providers";
import { getLocale } from "@/lib/locale-server";
import { t } from "@/lib/i18n";
import { OccupationPicker } from "@/components/OccupationPicker";

const DEVICE_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** The app signing in, from `?app=` (set by the auth-device function). */
function appOf(raw: string | string[] | undefined): { id: DeviceApp; name: string } {
  const v = (Array.isArray(raw) ? raw[0] : raw ?? "").toLowerCase();
  if (v === "revit") return { id: "revit", name: "Revit" };
  if (v === "rhino") return { id: "rhino", name: "Rhino" };
  return { id: "sketchup", name: "SketchUp" };
}

/**
 * FR-A4 (M6) — the browser half of the plugin device-code login, for the
 * SketchUp extension, the Revit add-in and the Rhino plug-in (`?app=`).
 *
 * The plugin opens this page with `?code=ABCD-EFGH&app=revit`.
 *
 * This page is deliberately SELF-CONTAINED: when the visitor is not signed in it
 * renders its own sign-in (Google + email) right here instead of bouncing to
 * `/login?next=/auth/device?code=...`. That earlier redirect chain lost the code
 * across an OAuth round-trip and, on a preview host, broke entirely. Keeping the
 * code on this page means the whole flow stays on one URL.
 *
 * A browser that is already signed in is asked, not assumed: the page shows
 * the account and a "Connect" button, with "Use a different account" to sign
 * in with Google or email instead. Coming back from that sign-in (Google or an
 * email link, `?signed_in=1`) is the architect's choice already, so it
 * connects straight away.
 */
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[]; status?: string; error?: string; app?: string | string[]; signed_in?: string }>;
}) {
  const params = await searchParams;
  const app = appOf(params.app);
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
      <Main code={code} app={app.name}>
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
      <Main code={code} app={app.name}>
        <DeviceSignIn
          code={code}
          app={app.id}
          appName={app.name}
          googleEnabled={withGoogle}
          googleClientId={googleClientId()}
          locale={locale}
          error={params.error}
        />
      </Main>
    );
  }

  // Just came back from signing in on this page: that was the choice, so
  // approve a live pending code without another click. `signed_in=1` alone is
  // only a hint anyone could add to a link, so it also needs a sign-in in
  // this browser within the last 10 minutes.
  const freshSignIn =
    !!user.last_sign_in_at && Date.now() - Date.parse(user.last_sign_in_at) < 10 * 60 * 1000;
  if (!status && params.signed_in === "1" && freshSignIn && DEVICE_CODE_RE.test(code)) {
    // approve_device_code (migration 0045): approves this code, for this user.
    const { data } = await supabase.rpc("approve_device_code", { p_code: code });
    status = data === true ? "approved" : "invalid";
  }

  // Already signed in in this browser: confirm the account before connecting.
  if (!status && DEVICE_CODE_RE.test(code)) {
    return (
      <Main code={code} app={app.name}>
        <p className="text-sm text-slate-600">
          You are signed in to Dirory in this browser as
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-slate-900">{user.email}</p>
        <form action={approveDevice} className="mt-4">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="app" value={app.id} />
          <button
            type="submit"
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Connect {app.name} to this account
          </button>
        </form>
        <form action={switchAccount} className="mt-2">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="app" value={app.id} />
          <button
            type="submit"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Use a different account (Google or email)
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          Only continue if you started this sign-in from Dirory in {app.name} and the code above matches the panel.
        </p>
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

  if (status === "approved") {
    return (
      <Main code={code} app={app.name}>
        <Notice tone="ok">
          <strong>You&apos;re signed in.</strong> Now go back to {app.name} — the Dirory panel
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
      <Main code={code} app={app.name}>
        <Notice tone="error">
          This code is not valid any more. Go back to {app.name}, click your account
          button and start the sign-in again.
        </Notice>
      </Main>
    );
  }

  // Signed in but the flow was opened without a usable code.
  return (
    <Main code={code} app={app.name}>
      <Notice tone="error">
        This page needs the code shown in {app.name}. Go back to {app.name}, click your
        account button and sign in again.
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

function Main({ code, app, children }: { code: string; app: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Connect {app}</h1>
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
