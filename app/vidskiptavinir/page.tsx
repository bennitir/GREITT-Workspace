import EmptyState from "@/components/ui/EmptyState";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function VidskiptavinirPage() {
  const customers = await prisma.customer.findMany({
    orderBy: {
      name: "asc",
    },
  });

  return (
    <main className="p-8">
      <PageHeader
  title="Viðskiptavinir"
  description="Yfirlit yfir alla viðskiptavini."
>
  <Link href="/vidskiptavinir/nytt">
    <Button>
      ➕ Nýr viðskiptavinur
    </Button>
  </Link>
</PageHeader>

      <div className="space-y-4">
        {customers.map((customer) => (
          <Card key={customer.id}>
            <h2 className="text-xl font-semibold">
              {customer.name}
            </h2>

            <p className="text-slate-600">
              {customer.kennitala}
            </p>

            <p className="mt-2">{customer.email}</p>
            <p>{customer.phone}</p>
            <p>{customer.address}</p>

            <div className="mt-4">
  <Link href={`/vidskiptavinir/${customer.id}`}>
    <Button>
      Opna viðskiptavin
    </Button>
  </Link>
</div>
          </Card>
        ))}

               {customers.length === 0 && (
          <EmptyState
            title="Engir viðskiptavinir skráðir"
            description="Stofnaðu fyrsta viðskiptavininn til að byrja."
          />
        )}
      </div>
    </main>
  );
}