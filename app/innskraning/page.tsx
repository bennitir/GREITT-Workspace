import { loginUser } from "@/app/actions/userActions";

export default async function InnskraningPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next === "/mobile" ? "/mobile" : "";
  return (
    <main className="flex min-h-screen bg-slate-100">
      {/* Vinstri GLÖGGT rammi */}
      <aside className="hidden w-64 shrink-0 bg-slate-900 p-6 text-white md:block">
        <h1 className="text-2xl font-bold">
  GLÖGGT
</h1>

<p className="mt-1 text-slate-400">
  Lausnir fyrir reksturinn
</p>
      </aside>

      {/* Innskráning */}
      <section className="flex flex-1 items-start justify-center px-4 py-16 sm:py-24">
        <div className="w-full max-w-md">
          {/* Haus á síma */}
          <div className="mb-8 text-center md:hidden">
            <div className="text-3xl font-extrabold tracking-wide text-slate-900">
              GLÖGGT
            </div>

            <div className="mt-1 text-base text-slate-600">
              Lausnir fyrir reksturinn
            </div>
          </div>

          {/* Innskráningarkort */}
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              Innskráning
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Skráðu þig inn til að halda áfram
            </p>

            <form action={loginUser} className="mt-8 space-y-5">
              <input type="hidden" name="next" value={next} />
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Netfang
                </label>

                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-slate-700"
                >
                  Lykilorð
                </label>

                <input
                  id="password"
                  type="password"
                  name="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
              >
                Skrá inn
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}