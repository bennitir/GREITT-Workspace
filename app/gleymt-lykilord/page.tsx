import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/passwordActions";

export default async function GleymtLykilordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";

  return (
    <main className="flex min-h-screen bg-slate-100">
      <aside className="hidden w-64 shrink-0 bg-slate-900 p-6 text-white md:block">
        <div className="text-2xl font-bold">GLÖGGT</div>
        <div className="mt-1 text-slate-400">
          Lausnir fyrir reksturinn
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            GLÖGGT
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            Gleymt lykilorð?
          </h1>

          {sent ? (
            <div className="mt-6">
              <p className="text-slate-700">
                Ef netfangið er skráð í GLÖGGT hefur verið sendur
                tölvupóstur með leiðbeiningum um að velja nýtt lykilorð.
              </p>

              <Link
                href="/innskraning"
                className="mt-6 inline-block font-semibold text-blue-600 hover:underline"
              >
                Til baka í innskráningu
              </Link>
            </div>
          ) : (
            <>
              <p className="mt-3 text-slate-600">
                Sláðu inn netfangið þitt og við sendum þér hlekk til
                að velja nýtt lykilorð.
              </p>

              <form action={requestPasswordReset} className="mt-6 space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Netfang
                  </label>

                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
                >
                  Senda endurstillingarhlekk
                </button>
              </form>

              <Link
                href="/innskraning"
                className="mt-6 inline-block text-sm font-semibold text-blue-600 hover:underline"
              >
                Til baka í innskráningu
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}