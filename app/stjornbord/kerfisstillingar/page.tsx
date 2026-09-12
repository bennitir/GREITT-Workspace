import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function SystemSettingsPage() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const session = token ? await prisma.session.findUnique({ where: { token }, include: { user: true } }) : null;
  if (!session || session.expiresAt < new Date() || !session.user.isActive) redirect("/innskraning");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Kerfisstillingar</h1>
        <p className="mt-2 text-slate-600">Stillingar fyrir rekstur GLÖGGT sjálfs. Fyrirtækisreglur og persónulegar notendastillingar eiga ekki heima hér.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">GLÖGGT Admin</h2>
          <p className="mt-2 text-sm text-slate-600">Grunnur fyrir kerfisvíðar stillingar, leyfi, pakka, rekstrarstýringu og eiginleika. Við bætum aðeins við stillingum hér þegar raunveruleg þörf kemur upp.</p>
        </section>
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Rétt aðskilnaður</h2>
          <p className="mt-2 text-sm text-slate-600">Bókhaldsferli eru undir fyrirtækisstillingum. Heimildir eru tengdar notanda og fyrirtæki. AI-stuðningur, tungumál og viðmótsóskir eru undir Mínum stillingum.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/stillingar" className="rounded-lg border px-4 py-2 font-semibold">Mínar stillingar</Link>
            <Link href="/stillingar/fyrirtaeki" className="rounded-lg border px-4 py-2 font-semibold">Fyrirtækisstillingar</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
