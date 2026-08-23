import CompanyCreateForm from "@/components/CompanyCreateForm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function NyttFyrirtaekiPage() {
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
    redirect("/fyrirtaeki");
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-6">
        Nýtt fyrirtæki
      </h1>

      <CompanyCreateForm />
    </main>
  );
}