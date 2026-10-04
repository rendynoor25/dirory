import { SignInForm } from "./SignInForm";

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
  const candidate = params.next ?? "/vendor";
  const next = candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/vendor";

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Dirory</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">
          We email you a magic link. No password to remember.
        </p>

        <SignInForm next={next} error={params.error} />

        <p className="mt-6 text-xs text-slate-500">
          Vendors and Dirory admins sign in here too. Architects sign in from inside SketchUp.
        </p>
      </div>
    </main>
  );
}
