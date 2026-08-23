import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export default async function ActiveCompany() {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    return (
      <div className="mt-4 rounded-lg bg-slate-800 p-3 text-sm text-slate-300">
        Ekkert virkt fyrirtæki
      </div>
    );
  }

  const company = await prisma.company.findUnique({
    where: {
      id: Number(activeCompanyId),
    },
  });

  if (!company) {
    return (
      <div className="mt-4 rounded-lg bg-slate-800 p-3 text-sm text-slate-300">
        Virkt fyrirtæki fannst ekki
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-lg bg-slate-800 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        Virkt fyrirtæki
      </p>

      <p className="mt-1 font-semibold text-white">
        {company.name}
      </p>
    </div>
  );
}