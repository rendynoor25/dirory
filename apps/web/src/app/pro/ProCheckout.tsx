"use client";

import { useEffect, useState } from "react";

type Plan = { id: string; name: string; price_idr: number; days: number; per_model: boolean };

const rupiah = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

/**
 * Pick a plan, pay its dynamic QRIS, and wait for the webhook to activate Pro.
 * The QR is minted server-side for this order only; this component never sees
 * a gateway key. It polls the order every 4 s while the QR is on screen.
 */
export function ProCheckout({ plans }: { plans: Plan[] }) {
  const [plan, setPlan] = useState<string>(plans[0]?.id ?? "");
  const [order, setOrder] = useState<{ id: string; qr: string; expires: string | null; amount: number } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "waiting" | "paid" | "error">("idle");
  const [message, setMessage] = useState("");
  const [endsAt, setEndsAt] = useState<string | null>(null);

  async function pay() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch("/api/pro/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok || !data.qr_url) throw new Error(data.error ?? "Could not create the QR.");
      setOrder({ id: data.order_id, qr: data.qr_url, expires: data.expires_at ?? null, amount: data.amount_idr });
      setState("waiting");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not create the QR.");
    }
  }

  useEffect(() => {
    if (state !== "waiting" || !order) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/pro/order?id=${order.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "paid") {
        setEndsAt(data.ends_at);
        setState("paid");
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [state, order]);

  if (state === "paid") {
    return (
      <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900">
        <p className="text-base font-semibold">Dirory Pro is active.</p>
        <p className="mt-1">
          {endsAt ? `Valid until ${new Date(endsAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}. ` : ""}
          Go back to SketchUp and click <strong>Estimate cost (RAB)</strong> again.
        </p>
      </div>
    );
  }

  const expired = order?.expires ? new Date(order.expires) <= new Date() : false;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <label
            key={p.id}
            className={`cursor-pointer rounded-xl border p-4 text-sm ${
              plan === p.id ? "border-brand-600 ring-2 ring-brand-600/20" : "border-slate-200"
            }`}
          >
            <input
              type="radio"
              name="plan"
              value={p.id}
              checked={plan === p.id}
              onChange={() => {
                setPlan(p.id);
                setOrder(null);
                setState("idle");
              }}
              className="sr-only"
            />
            <span className="block font-semibold text-slate-900">{p.per_model ? "One project" : "Monthly"}</span>
            <span className="mt-1 block text-2xl font-semibold tracking-tight">{rupiah(p.price_idr)}</span>
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              {p.per_model
                ? `${p.days} days for one SketchUp model — the first one you estimate.`
                : `${p.days} days, unlimited cost estimates on every model.`}
            </span>
          </label>
        ))}
      </div>

      {state === "waiting" && order && !expired ? (
        <div className="mt-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={order.qr}
            alt={`QRIS payment code for ${rupiah(order.amount)}`}
            className="mx-auto h-60 w-60 rounded-xl border border-slate-200 bg-white p-2"
          />
          <p className="mt-3 text-sm text-slate-600">
            Scan with any QRIS app (GoPay, OVO, DANA, ShopeePay, m-banking) to pay{" "}
            <strong>{rupiah(order.amount)}</strong>.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Waiting for the payment… this page updates by itself.
            {order.expires ? ` The code expires ${new Date(order.expires).toLocaleTimeString("id-ID")}.` : ""}
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={pay}
          disabled={state === "loading" || !plan}
          className="mt-6 w-full rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
        >
          {state === "loading" ? "Creating QRIS…" : expired ? "The code expired — create a new QRIS" : "Pay with QRIS"}
        </button>
      )}
      {message ? <p className="mt-3 text-sm text-rose-700">{message}</p> : null}
    </div>
  );
}
