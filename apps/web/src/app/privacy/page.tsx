import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "How Dirory handles account and SketchUp plugin data.",
};

/**
 * Plain ASCII on purpose: earlier edits of this file were corrupted by a
 * tool that round-tripped the encoding, turning an arrow and a middle dot into
 * mojibake. Keep punctuation simple here.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
      <Link href="/" className="text-sm font-semibold text-[#3549a7]">
        Back to Dirory
      </Link>
      <p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-[#465bb8]">
        Privacy - Draft
      </p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm leading-6 text-slate-600">
        This draft describes the current Dirory website and SketchUp extension. It must be reviewed
        by Indonesian privacy counsel and the placeholders completed before public launch.
      </p>

      <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700">
        <section>
          <h2 className="text-lg font-semibold text-slate-900">Account sign-in</h2>
          <p>
            Enter an email address, including Gmail, and Supabase Auth sends a one-time sign-in
            link. The first successful sign-in creates an architect account. Dirory does not ask for
            or store your email password. Your account email and profile details are used to
            provide the service and support.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Consent before download</h2>
          <p>
            Before the plugin can be downloaded, we show this notice and ask you to agree to it. We
            record the fact that you agreed, and which version of this notice, so there is a record
            of your consent. If we change this notice in a way that matters, we ask you to agree
            again before the next download. You can withdraw consent at any time by turning sharing
            off in the plugin account dialog, or by contacting us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">What the plugin sends</h2>
          <p>
            The plugin has a switch for sharing anonymous usage snapshots and searches that return
            no results. Project-title sharing is a separate choice and is off by default. Usage
            reports may include Dirory product names, brands, categories, quantities, painted area,
            and a SketchUp model identifier, plus the plugin and SketchUp version and your operating
            system. They do not include model geometry, the SketchUp file itself, or filesystem
            paths. Turn sharing off in the plugin account dialog to stop future reports.
          </p>
          <p className="mt-2">
            If we later add plugin diagnostics, such as counting failed loads or measuring how long
            a model takes to open, this page will say so before those reports begin, and the switch
            will cover them.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Optional details</h2>
          <p>
            You may optionally tell us your occupation, city and province. These are used only in
            aggregate, so we can see which kinds of designers use Dirory and where they work. They
            are never shown to a brand, they are never guessed, and you can leave them blank or
            change them later. A city is personal data, so it is collected only because you
            volunteered it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Quotes and vendors</h2>
          <p>
            Your contact information and project details are shared with a vendor only when you
            choose to send that vendor a quote request. Vendors do not get access to raw usage
            snapshots, project names, architect identities, or search misses.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">
            Storage, retention and your requests
          </h2>
          <p>
            Dirory uses Supabase for authentication, database and storage. The project is hosted in
            Singapore. To request access, correction or deletion, contact{" "}
            <a className="underline" href="mailto:hello@dirory.com">
              hello@dirory.com
            </a>{" "}
            with the subject &quot;Privacy request&quot;. Retention and deletion automation are
            still being implemented; this is a draft, not a final legal notice.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Controller</h2>
          <p>
            Before launch, this page must be updated with the legal entity name, postal address,
            privacy contact and any required data protection officer information under
            Indonesia&apos;s Personal Data Protection Law (UU No. 27/2022).
          </p>
        </section>
      </div>
    </main>
  );
}
