import CustomerEditForm from "@/components/CustomerEditForm";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BreytaVidskiptavinPage({ params }: Props) {
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
      <h1 className="text-3xl font-bold mb-6">
        Breyta viðskiptavini
      </h1>

      <CustomerEditForm customer={customer} />
    </main>
  );
}