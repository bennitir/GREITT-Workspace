import CompanyEditForm from "@/components/CompanyEditForm";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BreytaFyrirtaekiPage({ params }: Props) {
  const { id } = await params;
  const cookieStore = await cookies();
const activeUserId = cookieStore.get("activeUserId")?.value;

const activeUser = activeUserId
  ? await prisma.user.findUnique({
      where: {
        id: Number(activeUserId),
      },
    })
  : null;

if (!activeUser || activeUser.role !== "ADMIN") {
  redirect(`/fyrirtaeki/${id}`);
}

  const company = await prisma.company.findUnique({
    where: {
      id: Number(id),
    },
  });

  if (!company) {
    return (
      <main className="p-8">
        <h1>Fyrirtæki fannst ekki.</h1>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">
        Breyta fyrirtæki
      </h1>

      <CompanyEditForm company={company} />
    </main>
  );
}