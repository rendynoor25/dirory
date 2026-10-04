import Image from "next/image";
import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Made for SketchUp",
    text: "Find product models and material textures without leaving your design workflow.",
  },
  {
    number: "02",
    title: "Real Indonesian brands",
    text: "Explore products from local suppliers, organized by category and brand.",
  },
  {
    number: "03",
    title: "Free for designers",
    text: "Browse the library for free. Create an account to download and use the Dirory plugin.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f9fc] text-slate-950">
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="Dirory home">
          <Image src="/dirory-mark.png" alt="" width={37} height={40} priority className="h-10 w-auto object-contain" />
          <span className="text-lg font-semibold tracking-tight">Dirory</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-6" aria-label="Main navigation">
          <a href="#how-it-works" className="hidden text-sm text-slate-600 hover:text-slate-950 sm:inline">
            How it works
          </a>
          <Link href="/login?next=%2Fdownload" className="text-sm font-medium text-slate-700 hover:text-slate-950">
            Sign in
          </Link>
          <Link href="/login?next=%2Fdownload" className="rounded-full bg-[#3549a7] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#293b91]">
            Get the plugin
          </Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.04fr_.96fr] lg:px-10 lg:pb-28 lg:pt-16">
        <div className="pointer-events-none absolute -left-40 top-4 h-96 w-96 rounded-full bg-indigo-100/70 blur-3xl" />
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#3549a7] shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Product library for SketchUp
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-6xl lg:text-[4.5rem]">
            Design with products that are <span className="text-[#465bb8]">real.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            Dirory brings Indonesian construction brands, 3D models and material textures into one
            easy-to-use SketchUp library.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login?next=%2Fdownload" className="rounded-full bg-[#3549a7] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/15 transition hover:-translate-y-0.5 hover:bg-[#293b91]">
              Create a free account <span aria-hidden="true">→</span>
            </Link>
            <a href="#how-it-works" className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400">
              See how it works
            </a>
          </div>
          <p className="mt-4 text-xs text-slate-500">Free to browse. Account required to get the plugin download.</p>
          <div className="mt-10 flex items-center gap-4 border-t border-slate-200 pt-6">
            <div className="flex -space-x-2" aria-hidden="true">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f8f9fc] bg-[#e2e8ff] text-xs font-bold text-[#3549a7]">3D</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f8f9fc] bg-[#e6f3ed] text-xs font-bold text-emerald-800">M</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f8f9fc] bg-[#fff0dd] text-xs font-bold text-amber-800">ID</span>
            </div>
            <p className="text-sm text-slate-500"><strong className="font-semibold text-slate-800">Models. Materials. Brands.</strong> Ready for your next project.</p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:justify-self-end">
          <div className="absolute -right-8 -top-9 h-40 w-40 rounded-full bg-[#dce4ff] blur-2xl" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-[#e4f2eb] blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white bg-white p-3 shadow-[0_32px_100px_-42px_rgba(33,48,108,.42)]">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <span className="ml-3 text-xs font-medium text-slate-400">Dirory · SketchUp library</span>
            </div>
            <div className="grid grid-cols-[104px_1fr] gap-3 p-3 sm:grid-cols-[128px_1fr]">
              <aside className="rounded-2xl bg-[#f5f6fb] p-3">
                <div className="mb-4 flex items-center gap-2">
                  <Image src="/dirory-mark.png" alt="Dirory" width={23} height={25} className="h-6 w-auto" />
                  <span className="text-xs font-bold">Dirory</span>
                </div>
                {[["All products", true], ["Models", false], ["Materials", false], ["★ Favourite", false], ["Usage", false]].map(([label, active]) => (
                  <div key={label as string} className={`mb-1 rounded-lg px-2 py-2 text-[10px] ${active ? "bg-[#e5eaff] font-semibold text-[#3549a7]" : "text-slate-500"}`}>
                    {label as string}
                  </div>
                ))}
                <div className="mt-5 border-t border-slate-200 pt-3 text-[9px] uppercase tracking-wider text-slate-400">Brands</div>
                <div className="mt-2 space-y-2 text-[10px] text-slate-600"><p>◉ TOTO</p><p>◉ ROMAN</p><p>◉ Dirory</p></div>
              </aside>
              <div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-400">
                  <span>⌕ Search products and materials</span><span>⌘ K</span>
                </div>
                <div className="mt-3 flex gap-2 overflow-hidden text-[10px]">
                  <span className="rounded-full bg-[#3549a7] px-3 py-1.5 font-semibold text-white">All</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Models</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Materials</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600">Tiles</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                  <ProductTile name="Modern basin mixer" brand="TOTO" tone="blue" />
                  <ProductTile name="Stonewash · 60×120" brand="ROMAN" tone="sand" />
                  <ProductTile name="Minimal wall basin" brand="TOTO" tone="green" />
                  <ProductTile name="Warm oak texture" brand="DIRORY" tone="wood" />
                </div>
                <div className="mt-3 rounded-xl bg-[#f7f8fc] px-3 py-2 text-[10px] text-slate-500">Browse freely · sign in when you’re ready to use a product</div>
              </div>
            </div>
          </div>
          <div className="absolute -bottom-5 right-5 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl shadow-slate-900/10 sm:right-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Built for designers</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">Your material library, in SketchUp</div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#465bb8]">A better design workflow</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">The right products, closer to your work.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.number} className="rounded-2xl border border-slate-200 bg-[#fbfcff] p-6">
                <div className="text-xs font-bold tracking-widest text-[#6678c5]">{feature.number}</div>
                <h3 className="mt-5 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#202d70] px-7 py-10 text-white sm:px-12 sm:py-14">
          <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full border-[42px] border-white/5" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-indigo-200">Start designing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bring better product detail into your next SketchUp project.</h2>
            <p className="mt-4 leading-7 text-indigo-100">Create a free account. We’ll send a secure sign-in link to your email, then you can get the plugin.</p>
            <Link href="/login?next=%2Fdownload" className="mt-7 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#26377f] transition hover:bg-indigo-50">
              Create your free account <span className="ml-2" aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <Image src="/dirory-mark.png" alt="" width={22} height={24} className="h-6 w-auto" /> Dirory
          </Link>
          <p>Product library for architects and designers.</p>
          <div className="flex gap-5"><Link href="/privacy" className="hover:text-slate-900">Privacy</Link><Link href="/login" className="hover:text-slate-900">Account</Link></div>
        </div>
      </footer>
    </main>
  );
}

function ProductTile({ name, brand, tone }: { name: string; brand: string; tone: "blue" | "sand" | "green" | "wood" }) {
  const tones = {
    blue: "from-[#cdd8ff] to-[#eef1ff]",
    sand: "from-[#e9d7bd] to-[#f8f0e5]",
    green: "from-[#c9e3d4] to-[#edf6ef]",
    wood: "from-[#d4b797] to-[#f2e4d2]",
  };
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
      <div className={`relative flex h-20 items-center justify-center bg-gradient-to-br ${tones[tone]} sm:h-24`}>
        <div className="h-10 w-10 rounded-[35%] border-[5px] border-white/80 shadow-sm sm:h-12 sm:w-12" />
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-white/80 px-1.5 py-0.5 text-[8px] font-semibold text-slate-600">{brand}</span>
        <span className="absolute right-2 top-1 text-white drop-shadow">☆</span>
      </div>
      <div className="px-2.5 py-2"><div className="truncate text-[10px] font-semibold text-slate-800">{name}</div><div className="mt-1 text-[9px] text-slate-400">View product&nbsp; →</div></div>
    </div>
  );
}
