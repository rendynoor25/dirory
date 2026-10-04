import { redirect } from "next/navigation";
import { createSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { approveDevice } from "./actions";

/**
 * FR-A4 (M6) — the browser half of the SketchUp device-code login.
 *
 * The plugin opens this page with `?code=ABCD-EFGH`. After the architect signs
 * in, the code is approved and the plugin's next poll receives its token.
 *
 * Auto-approve: when a signed-in user opens this page with a valid code we
 * approve it immediately, so a returning user (especially with Google sign-in)
 * goes from "click sign-in in SketchUp" to connected with no extra step. The
 * manual form remains for the case where auto-approval does not apply.
 */
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; status?: string }>;
}) {
  const params = await searchParams;
  const code = (params.code ?? "").trim().toUpperCase();
  let status = params.status;

  if (!isSupabaseConfigured()) {
    return (
      <Main>
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Account sign-in is temporarily unavailable. Please try again shortly.
        </p>
      </Main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/auth/device?code=${code}`)}`);
  }

  // Auto-approve a live pending code for the signed-in user, unless we were
  // already told the outcome. Any failure falls through to the manual button.
  if (!status && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    const { data } = await supabase
      .from("plugin_device_codes")
      .update({ status: "approved", profile_id: user.id, approved_at: new Date().toISOString() })
      .eq("user_code", code)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .select("user_code");
    status = data && data.length > 0 ? "approved" : "invalid";
  }

  return (
    <Main>
      {status === "approved" ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Device approved. Return to SketchUp — the Dirory panel will finish signing in on its own.
        </p>
      ) : status === "invalid" ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          This code is not valid any more. Go back to SketchUp and start the sign-in again.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-600">
            A SketchUp session is asking to sign in to your Dirory account.
          </p>
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Device code</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-slate-900">
              {code || "————-————"}
            </p>
          </div>
          <form action={approveDevice} className="mt-5">
            <input type="hidden" name="code" value={code} />
            <button
              type="submit"
              disabled={!code}
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Approve this device
            </button>
          </form>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Only approve if this code matches the one shown in SketchUp. Signed in as {user.email}.
          </p>
        </>
      )}
    </Main>
  );
}

function Main({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Connect SketchUp</h1>
        {children}
      </div>
    </main>
  );
}
