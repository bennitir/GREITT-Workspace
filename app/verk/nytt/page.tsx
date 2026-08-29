import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

async function createWorkOrder(formData: FormData) {
  "use server";

  const cookieStore = await cookies();

  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  const activeUserId = cookieStore.get("activeUserId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const priority = String(formData.get("priority") ?? "NORMAL");

  if (!title) {
    throw new Error("Heiti verks vantar.");
  }

  const createdById = activeUserId
    ? Number(activeUserId)
    : null;

  await prisma.workOrder.create({
    data: {
      companyId,
      createdById:
        createdById && Number.isInteger(createdById)
          ? createdById
          : null,
      title,
      description: description || null,
      address: address || null,
      priority,
      status: "NEW",
    },
  });

  revalidatePath("/verk");
  redirect("/verk");
}

export default async function NýttVerkPage() {
  return (
    <main className="space-y-6 p-8">
      <PageHeader
        title="Nýtt verk"
        description="Skráðu nýtt verk fyrir virkt fyrirtæki."
      />

      <Card>
        <form action={createWorkOrder} className="space-y-6">
          <div>
            <label
              htmlFor="title"
              className="block font-medium"
            >
              Heiti verks
            </label>

            <input
              id="title"
              name="title"
              type="text"
              required
              className="mt-2 w-full rounded-lg border px-4 py-3"
              placeholder="T.d. Viðgerð á hitakerfi"
            />
          </div>

          <div>
            <label
              htmlFor="address"
              className="block font-medium"
            >
              Heimilisfang
            </label>

            <input
              id="address"
              name="address"
              type="text"
              className="mt-2 w-full rounded-lg border px-4 py-3"
              placeholder="Heimilisfang verks"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block font-medium"
            >
              Lýsing
            </label>

            <textarea
              id="description"
              name="description"
              rows={5}
              className="mt-2 w-full rounded-lg border px-4 py-3"
              placeholder="Lýstu verkinu..."
            />
          </div>

          <div>
            <label
              htmlFor="priority"
              className="block font-medium"
            >
              Forgangur
            </label>

            <select
              id="priority"
              name="priority"
              defaultValue="NORMAL"
              className="mt-2 w-full rounded-lg border px-4 py-3"
            >
              <option value="LOW">Lágur</option>
              <option value="NORMAL">Venjulegur</option>
              <option value="HIGH">Mikill</option>
              <option value="URGENT">Brýnt</option>
            </select>
          </div>

          <div className="flex gap-3">
            <Button type="submit">
              Vista verk
            </Button>

            <a
              href="/verk"
              className="rounded-lg border px-4 py-2 font-medium"
            >
              Hætta við
            </a>
          </div>
        </form>
      </Card>
    </main>
  );
}