import DeleteCustomerButton from "@/components/DeleteCustomerButton";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function VidskiptavinurDetailPage({ params }: Props) {
  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: {
      id: Number(id),
    },
  });

  if (!customer) {
    return (
      <main className="p-8">
        <h1>Viðskiptavinur fannst ekki.</h1>
      </main>
    );
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">{customer.name}</h1>

      <div className="mt-6 space-y-3 rounded-lg border bg-white p-6 shadow-sm">
        <p>
          <strong>Kennitala:</strong> {customer.kennitala}
        </p>

        <p>
          <strong>Netfang:</strong> {customer.email}
        </p>

        <p>
          <strong>Sími:</strong> {customer.phone}
        </p>

        <p>
          <strong>Heimilisfang:</strong> {customer.address}
        </p>

      <div className="pt-4 flex gap-3">
  <Link
    href={`/vidskiptavinir/${id}/breyta`}
    className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
  >
    Breyta viðskiptavini
  </Link>

  <DeleteCustomerButton id={customer.id} />

  <Link
    href="/vidskiptavinir"
    className="inline-block rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-800"
  >
    Til baka
  </Link>
</div>
      </div>
    </main>
  );
}