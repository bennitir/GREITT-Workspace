import CompanyEditForm from "@/components/CompanyEditForm";
import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";
import { redirect } from "next/navigation";
import { companyEditText } from "@/lib/i18n/company-edit";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BreytaFyrirtaekiPage({
  params,
}: Props) {
  const { id } = await params;
  const companyId = Number(id);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  if (activeUser.role !== "ADMIN") {
    redirect("/fyrirtaeki");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: activeUser.id },
    select: { interfaceLanguage: true },
  });
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = companyEditText(language);

  const company = await prisma.company.findUnique({
  where: {
    id: companyId,
  },
  include: {
    activities: {
      orderBy: [
        {
          isActive: "desc",
        },
        {
          code: "asc",
        },
        {
          name: "asc",
        },
      ],
    },
  },
});

  if (!company) {
    redirect("/fyrirtaeki");
  }

  return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">
        {t.title}
      </h1>

      <CompanyEditForm company={company} language={language} />
    </main>
  );
}