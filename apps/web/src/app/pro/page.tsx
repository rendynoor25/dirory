import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { ProCheckout } from "./ProCheckout";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dirory Pro" };

/**
 * Dirory Pro for architects: the RAB (cost estimate) in the SketchUp plugin,
 * paid by QRIS (migration 0039). The plugin links here when an estimate needs
 * Pro.
 */
export default async function ProPage() {
  const { supabase, user } = await getSession();

  const { data: plans } = await supabase
    .from("pro_plans")
    .select("id, name, price_idr, days, per_model")
    .eq("active", true)
    .order("sort");

  let active: { plan_id: string; ends_at: string; model_hash: string | null }[] = [];
  if (user) {
    const { data } = await supabase
      .from("pro_entitlements")
      .select("plan_id, ends_at, model_hash")
      .gt("ends_at", new Date().toISOString())
      .order("ends_at", { ascending: false });
    active = data ?? [];
  }
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8f9fc] px-6 py-16">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
          <Image src="/dirory-mark.png" alt="" width={30} height={33} className="h-8 w-auto" /> Dirory
        </Link>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-brand-600">For architects</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Dirory Pro</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Turn your SketchUp model into a Rencana Anggaran Biaya: walls, floors, ceilings, roofs, doors
          and windows measured from the model and priced with official AHSP coefficients and local unit
          prices (DKI Jakarta first). Print it or export it to Excel.
        </p>

        {active.length ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <strong>Pro is active.</strong>{" "}
            {active.map((a, i) => (
              <span key={i}>
                {a.plan_id === "pro_project" ? "Project pass" : "Monthly"} until {fmt(a.ends_at)}
                {a.plan_id === "pro_project" ? (a.model_hash ? " (bound to one model)" : " (not used yet)") : ""}
                {i < active.length - 1 ? "; " : "."}
              </span>
            ))}{" "}
            You can extend it below.
          </div>
        ) : null}

        <div className="mt-7">
          {user ? (
            <ProCheckout plans={plans ?? []} />
          ) : (
            <>
              {/* Prices before sign-in: nobody should have to sign up to see them. */}
              <div className="grid gap-3 sm:grid-cols-2">
                {(plans ?? []).map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                    <span className="block font-semibold text-slate-900">{p.per_model ? "One project" : "Monthly"}</span>
                    <span className="mt-1 block text-2xl font-semibold tracking-tight">
                      Rp {Number(p.price_idr).toLocaleString("id-ID")}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {p.per_model
                        ? `${p.days} days for one model — the first one you estimate.`
                        : `${p.days} days, unlimited cost estimates on every model.`}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/login?next=%2Fpro"
                className="mt-6 inline-flex rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
              >
                Sign in to get Pro
              </Link>
            </>
          )}
        </div>

        <p className="mt-7 text-xs leading-5 text-slate-500">
          Payment by QRIS through Midtrans. Pro is personal to your Dirory account and is not renewed
          automatically. Estimates are a starting point for your quantity surveyor, not a tender
          document; prices exclude PPN.
        </p>
      </section>
    </main>
  );
}
