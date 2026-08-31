import crypto from "crypto";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resetPassword } from "@/app/actions/passwordActions";
import PasswordInput from "@/components/ui/PasswordInput";

export default async function EndurstillaLykilordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token ?? "";

  const tokenHash = token
    ? crypto.createHash("sha256").update(token).digest("hex")
    : "";

  const resetToken = tokenHash
    ? await prisma.passwordResetToken.findUnique({
        where: { tokenHash },
      })
    : null;

  const tokenIsValid =
    resetToken &&
    !resetToken.usedAt &&
    resetToken.expiresAt > new Date();

  if (!token || !tokenIsValid) {
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
              Ógildur hlekkur
            </h1>

            <p className="mt-4 text-slate-700">
              Endurstillingarhlekkurinn er ógildur, útrunninn eða hefur þegar
              verið notaður.
            </p>

            <Link
              href="/gleymt-lykilord"
              className="mt-6 inline-block font-semibold text-blue-600 hover:underline"
            >
              Biðja um nýjan hlekk
            </Link>
          </div>
        </div>
      </main>
    );
  }

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
            Veldu nýtt lykilorð
          </h1>

          <p className="mt-3 text-slate-600">
            Nýja lykilorðið þarf að vera að minnsta kosti 10 stafir.
          </p>

          <form action={resetPassword} className="mt-6 space-y-5">
            <input type="hidden" name="token" value={token} />

            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-slate-700"
              >
                Nýtt lykilorð
              </label>

              <PasswordInput
                id="newPassword"
                name="newPassword"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-slate-700"
              >
                Staðfesta nýtt lykilorð
              </label>

              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                required
                minLength={10}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Vista nýtt lykilorð
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}