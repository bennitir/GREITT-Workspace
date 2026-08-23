import { createImportBatch } from "@/app/actions/importActions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCompanyAccess } from "@/lib/core/access-control";
export default async function InnflutningurPage() {

    const cookieStore = await cookies();
const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

if (!activeCompanyId) {
  redirect("/fyrirtaeki");
}

const companyId = Number(activeCompanyId);
const access = await getCompanyAccess(companyId);

if (!access.allowed) {
  redirect("/fyrirtaeki");
}

if (!access.canUpload) {
  redirect("/");
}
  return (
    <main className="w-full max-w-[1400px] mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Innflutningur</h1>
        <p className="mt-2 text-slate-600">
          Flytja inn bókhaldsgögn úr CSV eða Excel til yfirferðar áður en þau eru bókuð.
        </p>
      </div>

      <div className="rounded-lg border p-4">
  <h2 className="text-lg font-semibold">Nýr innflutningur</h2>

  <p className="mt-2 text-sm text-slate-600">
    Veldu CSV eða Excel skrá. Engin gögn verða bókuð við þetta skref.
  </p>

  <form action={createImportBatch} className="mt-4 space-y-4">
    <input
      type="file"
      name="file"
      accept=".csv,.xlsx,.xls"
      required
      className="block w-full rounded border p-3"
    />

    <button
      type="submit"
      className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
    >
      Lesa inn skrá
    </button>
  </form>
</div>
    </main>
  );
}