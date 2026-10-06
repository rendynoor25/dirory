import { SignInForm } from "./SignInForm";
import { googleEnabled } from "@/lib/providers";

/**
 * Sign-in page — a server component.
 *
 * Next.js 15 delivers `searchParams` as a Promise, so it is awaited here. The
 * interactive form lives in `SignInForm` because a client component cannot be
 * `async`; doing so triggered React error #321 (invalid hook call).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  // A visitor signing in from the public page should return home, not be sent
  // to the vendor portal. Protected destinations (e.g. /admin or /download)
  // arrive explicitly via `next` and are preserved.
  const candidate = params.next ?? "/";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
  const withGoogle = await googleEnabled();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">
          {withGoogle
            ? "Continue with Google, or use an email link. No password to remember."
            : "Use an email link to sign in. No password to remember."}
        </p>

        <SignInForm next={next} error={params.error} googleEnabled={withGoogle} />

        <p className="mt-6 text-xs text-slate-500">
          Vendors and Dirory admins sign in here too. Architects sign in from inside SketchUp.
        </p>
      </div>
    </main>
  );
}
