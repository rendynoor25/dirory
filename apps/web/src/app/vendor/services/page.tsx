import Link from "next/link";
import { Badge, Card, CardHeader, Empty } from "@/components/ui";
import { getSession } from "@/lib/auth";
import { formatDate, formatIDR } from "@/lib/format";
import { acceptServiceQuote, createServiceRequest } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Service requests — the vendor side of Dirory's digitization service.
 *
 * `requested -> quoted -> accepted -> in_progress -> delivered`. "Paid" is not a
 * step: it is read from the linked invoice, so money has one source of truth.
 * The vendor can open a request and accept a quote; every other transition is
 * Dirory's, which is why the table has no vendor UPDATE policy and accepting goes
 * through `vendor_accept_service_quote()`.
 */

const STEPS = ["Requested", "Quoted", "Accepted", "Modelling", "Delivered"] as const;

function stepIndex(status: string): number {
  switch (status) {
    case "requested":
      return 0;
    case "quoted":
      return 1;
    case "accepted":
      return 2;
    case "in_progress":
      return 3;
    case "delivered":
      return 4;
    default:
      return -1; // cancelled
  }
}

function Progress({ status }: { status: string }) {
  const idx = stepIndex(status);
  if (idx < 0) return <p className="mt-3 text-xs font-medium text-rose-600">Cancelled</p>;
  return (
    <div className="mt-3">
      <div className="flex gap-1">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-brand-600" : "bg-slate-200"}`}
          />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1 text-[10px] uppercase tracking-wide">
        {STEPS.map((label, i) => (
          <span key={label} className={i <= idx ? "font-semibold text-brand-700" : "text-slate-400"}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

type RequestRow = {
  id: string;
  title: string;
  product_count: number | null;
  brief: string | null;
  admin_note: string | null;
  status: string;
  quoted_idr: number | null;
  invoice_id: string | null;
  created_at: string;
  invoices: { status: string } | null;
};

export default async function VendorServices({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { supabase, memberships } = await getSession();
  const membership = memberships[0];
  const sp = await searchParams;
  if (!membership) return null;

  const { data } = await supabase
    .from("service_requests")
    .select(
      "id, title, product_count, brief, admin_note, status, quoted_idr, invoice_id, created_at, invoices(status)",
    )
    .eq("vendor_id", membership.vendor_id)
    .order("created_at", { ascending: false });
  const requests = (data ?? []) as unknown as RequestRow[];

  return (
    <div className="space-y-6">
      {sp.error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{sp.error}</p>
      ) : sp.created ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Request received. The Dirory team will review it and send you a quote.
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Ask Dirory to model your products"
          subtitle="We build the 3D model or digitize the material, and it goes into your catalogue."
        />
        <form action={createServiceRequest} className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">What would you like modelled?</label>
            <input
              name="title"
              required
              placeholder="e.g. 12 wall-hung basins from the 2026 range"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">How many products?</label>
            <input
              name="product_count"
              type="number"
              min={1}
              placeholder="12"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">Anything else we should know?</label>
            <textarea
              name="brief"
              rows={3}
              placeholder="Where the files are, what format, deadline…"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Send request
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Your requests"
          subtitle="Dirory quotes first — nothing is charged until you accept the quote."
        />
        {requests.length ? (
          <div className="divide-y divide-slate-100">
            {requests.map((r) => {
              const paid = r.invoices?.status === "paid";
              return (
                <div key={r.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Opened {formatDate(r.created_at)}
                        {r.product_count ? ` · ${r.product_count} products` : ""}
                      </p>
                    </div>
                    <Badge
                      tone={
                        r.status === "delivered"
                          ? "green"
                          : r.status === "cancelled"
                            ? "red"
                            : r.status === "quoted"
                              ? "amber"
                              : "blue"
                      }
                    >
                      {r.status.replace("_", " ")}
                    </Badge>
                  </div>

                  <Progress status={r.status} />

                  {r.brief ? (
                    <p className="mt-3 text-xs text-slate-500">Your brief: {r.brief}</p>
                  ) : null}
                  {r.admin_note ? (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      From Dirory: {r.admin_note}
                    </p>
                  ) : null}

                  {r.status === "quoted" && r.quoted_idr ? (
                    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div>
                        <p className="text-xs text-amber-800">Dirory&apos;s quote</p>
                        <p className="text-lg font-semibold text-amber-900">{formatIDR(r.quoted_idr)}</p>
                      </div>
                      <form action={acceptServiceQuote}>
                        <input type="hidden" name="request_id" value={r.id} />
                        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                          Accept &amp; get the invoice
                        </button>
                      </form>
                    </div>
                  ) : null}

                  {r.invoice_id ? (
                    <p className="mt-3 text-xs text-slate-500">
                      {paid ? (
                        <span className="font-medium text-emerald-700">
                          Paid — Dirory will begin shortly.
                        </span>
                      ) : (
                        <>
                          Awaiting payment.{" "}
                          <Link
                            href={`/vendor/subscription/invoice/${r.invoice_id}`}
                            className="font-medium text-brand-600 underline"
                          >
                            Open the invoice
                          </Link>
                        </>
                      )}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>No requests yet. Ask for modelling above and it appears here.</Empty>
        )}
      </Card>
    </div>
  );
}
