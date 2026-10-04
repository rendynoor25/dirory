import Link from "next/link";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const body = (
    <Card className="h-full p-5 transition hover:border-brand-300">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const toneMap: Record<string, string> = {
  gray: "bg-slate-100 text-slate-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  blue: "bg-brand-100 text-brand-800",
  purple: "bg-purple-100 text-purple-800",
};

export function Badge({
  children,
  tone = "gray",
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneMap[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof toneMap {
  switch (status) {
    case "approved":
    case "active":
    case "paid":
    case "won":
      return "green";
    case "pending":
    case "pending_review":
    case "trial":
    case "grace":
    case "unpaid":
    case "new":
      return "amber";
    case "rejected":
    case "suspended":
    case "expired":
    case "lost":
    case "void":
      return "red";
    case "contacted":
    case "planned":
      return "blue";
    case "added":
      return "purple";
    default:
      return "gray";
  }
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
            {head.map((h) => (
              <th key={h} className="px-5 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-5 py-3 align-top text-slate-700 ${className}`}>{children}</td>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-slate-500">{children}</div>;
}

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700",
    ghost: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  }[variant];
  return (
    <button
      type="submit"
      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition ${styles}`}
    >
      {children}
    </button>
  );
}