import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { previewPaymentCardStatement } from "@/app/banki/kort/actions";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";

type Props = { params: Promise<{ id: string }> };

export default async function PaymentCardImportPage({ params }: Props) {
  const { id } = await params;
  const paymentCardId = Number(id);
  const { companyId, t } = await paymentCardPageContext();
  if (!companyId || !paymentCardId) notFound();

  const card = await prisma.paymentCard.findFirst({
    where: { id: paymentCardId, companyId, isActive: true },
  });
  if (!card) notFound();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">📥 {t.importTitle}</h1>

      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">{card.name}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {[card.issuerName, card.network, card.lastFour ? `•••• ${card.lastFour}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-4 text-gray-600">{t.importHelp}</p>

        <form action={previewPaymentCardStatement} className="mt-6">
          <input type="hidden" name="paymentCardId" value={card.id} />
          <label className="mb-2 block font-medium">{t.chooseFile}</label>
          <input
            type="file"
            name="file"
            accept=".xlsx,.xls"
            className="block w-full rounded-lg border p-3"
            required
          />
          <button
            type="submit"
            className="mt-6 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            {t.readPreview}
          </button>
        </form>
      </div>
    </main>
  );
}
