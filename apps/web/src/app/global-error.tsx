"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-rose-600">Dirory</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600">{error.message}</p>
            <button
              onClick={reset}
              className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
