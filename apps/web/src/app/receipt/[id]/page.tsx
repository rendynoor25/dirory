import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { formatIDR } from "@/lib/format";
import { terbilangRupiah } from "@/lib/terbilang";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kuitansi" };

/** "9 Oktober 2026" — long form, in Bahasa Indonesia. */
function tanggalID(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(value));
}

function periodeID(from: string | null | undefined, to: string | null | undefined): string | null {
  if (!from || !to) return null;
  const f = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(from));
  const t = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(to));
  return `${f} – ${t}`;
}

/**
 * Kuitansi (Indonesian receipt) for a paid invoice.
 *
 * Deliberately OUTSIDE the vendor layout: a receipt is a document, and it should
 * print without a sidebar or a top bar around it. Authorisation is therefore
 * repeated here rather than inherited.
 *
 * Bahasa Indonesia throughout, with the amount stated in words as well as
 * figures — the convention on Indonesian receipts.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, memberships } = await getSession();
  if (!user) notFound();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "id, vendor_id, amount_idr, status, gateway, gateway_ref, payment_method, paid_at, created_at, " +
        "vendors(brand_name, name, email), " +
        "subscriptions(current_period_start, current_period_end, plans(name, period))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!invoice) notFound();

  // The Supabase client is untyped here, so the joined select comes back as a
  // loose union. Cast once to a shape this page actually uses.
  const inv = invoice as unknown as {
    id: string;
    vendor_id: string;
    amount_idr: number;
    status: string;
    gateway: string | null;
    gateway_ref: string | null;
    payment_method: string | null;
    paid_at: string | null;
    created_at: string;
    vendors?: { brand_name?: string | null; name?: string | null; email?: string | null } | null;
    subscriptions?: {
      current_period_start?: string | null;
      current_period_end?: string | null;
      plans?: { name?: string | null; period?: string | null } | null;
    } | null;
  };

  // RLS already limits this to the vendor's own invoices; the explicit check
  // makes the intent obvious and survives a policy change.
  const mine = memberships.some((m) => m.vendor_id === inv.vendor_id);
  if (!mine) notFound();

  const vendor = inv.vendors ?? {};
  const subscription = inv.subscriptions ?? {};
  const plan = subscription.plans ?? {};

  const paid = inv.status === "paid";
  const paidAt = inv.paid_at ?? inv.created_at;
  const tahun = new Date(paidAt).getFullYear();
  const nomor = `KWT/DIR/${tahun}/${String(inv.id).slice(0, 8).toUpperCase()}`;

  const periode = periodeID(subscription.current_period_start, subscription.current_period_end);
  const paket = plan.name
    ? `Langganan aplikasi Dirory — paket ${plan.name}${plan.period === "yearly" ? " (1 tahun)" : " (1 bulan)"}`
    : "Langganan aplikasi Dirory";

  const metode = [inv.gateway, inv.payment_method].filter(Boolean).join(" · ") || "-";

  return (
    <main className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 18mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="mx-auto max-w-2xl px-4 print:max-w-none print:px-0">
        {/* Toolbar — never printed. */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/vendor/subscription/invoice/${inv.id}`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Kembali ke tagihan
          </Link>
          {paid ? <PrintButton /> : null}
        </div>

        {!paid ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            <p className="font-semibold">Kuitansi belum tersedia</p>
            <p className="mt-1">
              Kuitansi diterbitkan setelah pembayaran dikonfirmasi. Status tagihan ini masih{" "}
              <strong>{inv.status}</strong>.
            </p>
          </div>
        ) : (
          <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
            {/* Header */}
            <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-5">
              <div>
                <p className="text-lg font-semibold tracking-tight text-slate-900">Dirory</p>
                <p className="mt-0.5 text-xs text-slate-500">Pustaka produk untuk SketchUp</p>
              </div>
              <div className="text-right">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">KUITANSI</h1>
                <p className="mt-1 text-xs text-slate-500">No. {nomor}</p>
              </div>
            </header>

            {/* Body */}
            <dl className="mt-6 space-y-3 text-sm">
              <Row label="Telah diterima dari">
                <span className="font-medium text-slate-900">{vendor.brand_name ?? "-"}</span>
                {vendor.name && vendor.name !== vendor.brand_name ? (
                  <span className="block text-xs text-slate-500">{vendor.name}</span>
                ) : null}
              </Row>
              <Row label="Uang sejumlah">
                <span className="font-medium text-slate-900">{terbilangRupiah(inv.amount_idr)}</span>
              </Row>
              <Row label="Untuk pembayaran">
                <span className="text-slate-800">{paket}</span>
                {periode ? <span className="block text-xs text-slate-500">Periode: {periode}</span> : null}
              </Row>
              <Row label="Metode pembayaran">
                <span className="text-slate-800">{metode}</span>
                {inv.gateway_ref ? (
                  <span className="block text-xs text-slate-500">Ref: {inv.gateway_ref}</span>
                ) : null}
              </Row>
              <Row label="Tanggal">
                <span className="text-slate-800">{tanggalID(paidAt)}</span>
              </Row>
            </dl>

            {/* Amount */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">Keterangan</th>
                    <th className="px-4 py-2 text-right font-medium">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 text-slate-700">{paket}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatIDR(inv.amount_idr)}
                    </td>
                  </tr>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">Total</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {formatIDR(inv.amount_idr)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Signature */}
            <div className="mt-10 flex justify-end">
              <div className="text-center">
                <p className="text-xs text-slate-500">Hormat kami,</p>
                {/*
                  The signature lives at apps/web/public/signature.jpg. If it is
                  removed the receipt still reads correctly, just without the
                  image, so this is a plain <img> rather than a build-time check.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/signature.jpg"
                  alt="Tanda tangan"
                  className="mx-auto my-1 h-16 w-auto object-contain"
                />
                <p className="border-t border-slate-300 pt-1 text-sm font-medium text-slate-900">
                  Rendy Noor Chandra
                </p>
                <p className="text-xs text-slate-500">Dirory</p>
              </div>
            </div>

            <p className="mt-8 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">
              Kuitansi ini diterbitkan secara otomatis oleh sistem Dirory dan sah tanpa tanda tangan
              basah. ID tagihan: {inv.id}
            </p>
          </article>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
