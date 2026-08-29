import CompanyCreateForm from "@/components/CompanyCreateForm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function NyttFyrirtaekiPage() {
  const cookieStore = await cookies();

const sessionToken = cookieStore.get("sessionToken")?.value;
const activeUserId = cookieStore.get("activeUserId")?.value;

const session = sessionToken
  ? await prisma.session.findUnique({
      where: {
        token: sessionToken,
      },
      include: {
        user: true,
      },
    })
  : null;

const sessionUser =
  session &&
  session.expiresAt > new Date() &&
  session.user.isActive
    ? session.user
    : null;

const activeUser =
  sessionUser?.role === "ADMIN" && activeUserId
    ? await prisma.user.findUnique({
        where: {
          id: Number(activeUserId),
        },
      })
    : sessionUser;

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