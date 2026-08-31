import PasswordInput from "@/components/ui/PasswordInput";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { changeRequiredPassword } from "@/app/actions/passwordActions";

export default async function SkiptaLykilordiPage() {
  const cookieStore = await cookies();
  const sessionToken =
    cookieStore.get("sessionToken")?.value;

  if (!sessionToken) {
    redirect("/innskraning");
  }

  const session = await prisma.session.findUnique({
    where: {
      token: sessionToken,
    },
    include: {
      user: true,
    },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.user.isActive
  ) {
    redirect("/innskraning");
  }

  if (!session.user.mustChangePassword) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-8">
            <div className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-700">
              GLÖGGT
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              Veldu nýtt lykilorð
            </h1>

            <p className="mt-3 text-lg leading-7 text-slate-600">
              Þú ert að skrá þig inn í fyrsta sinn með
              tímabundnu lykilorði. Áður en þú heldur áfram
              þarftu að velja þitt eigið lykilorð.
            </p>
          </div>

          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">
              Notandi
            </p>

            <p className="mt-1 text-amber-900">
              {session.user.name}
            </p>

            <p className="text-sm text-amber-800">
              {session.user.email}
            </p>
          </div>

          <form
            action={changeRequiredPassword}
            className="space-y-6"
          >
            <div>
              <label
                htmlFor="newPassword"
                className="mb-2 block text-lg font-semibold text-slate-800"
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

              <p className="mt-2 text-sm text-slate-600">
                Lykilorðið þarf að vera að minnsta kosti
                10 stafir. Þú getur einnig notað sterkt
                lykilorð sem vafrinn þinn leggur til.
              </p>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-lg font-semibold text-slate-800"
              >
                Endurtaktu nýja lykilorðið
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
              className="w-full rounded-xl bg-blue-700 px-6 py-4 text-lg font-bold text-white transition hover:bg-blue-800"
            >
              Vista nýtt lykilorð
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Eftir breytinguna verður gamla tímabundna
            lykilorðið ekki lengur gilt.
          </p>
        </div>
      </div>
    </main>
  );
}