import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/locale";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PaymentCardPage({ params }: Props) {
  const { id } = await params;
  const paymentCardId = Number(id);
  const { companyId, t } = await paymentCardPageContext();

  if (!companyId || !paymentCardId) notFound();

  const card = await prisma.paymentCard.findFirst({
    where: { id: paymentCardId, companyId, isActive: true },
  });
  if (!card) notFound();

  const transactions = await prisma.paymentCardTransaction.findMany({
    where: { paymentCardId: card.id },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 200,
  });

  return (
    <main className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">💳 {card.name}</h1>
          <p className="mt-1 text-gray-600">
            {[card.issuerName, card.network].filter(Boolean).join(" · ") || t.card}
            {card.lastFour ? ` · •••• ${card.lastFour}` : ""}
          </p>
        </div>
        <Link href="/banki" className="rounded-lg border px-4 py-2 font-medium">
          ← {t.sectionTitle}
        </Link>
      </div>

      <div className="mt-6 max-w-6xl rounded-lg border p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <p><strong>{t.issuer}:</strong> {card.issuerName ?? t.notRegistered}</p>
          <p><strong>{t.network}:</strong> {card.network ?? t.notRegistered}</p>
          <p><strong>{t.lastFour}:</strong> {card.lastFour ?? t.notRegistered}</p>
        </div>

        <Link
          href={`/banki/kort/${card.id}/innflutningur`}
          className="mt-6 inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700"
        >
          📥 {t.importStatement}
        </Link>

        <h2 className="mt-8 text-xl font-semibold">{t.transactions}</h2>

        {transactions.length === 0 ? (
          <p className="mt-4 text-gray-600">{t.noTransactions}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2">{t.date}</th>
                  <th className="p-2">{t.merchant}</th>
                  <th className="p-2">{t.category}</th>
                  <th className="p-2">{t.cardPeriod}</th>
                  <th className="p-2 text-right">ISK</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b">
                    <td className="whitespace-nowrap p-2">{formatDate(transaction.date)}</td>
                    <td className="p-2 font-medium">{transaction.merchantText}</td>
                    <td className="p-2">{transaction.merchantCategory ?? "—"}</td>
                    <td className="p-2">{transaction.cardPeriod ?? "—"}</td>
                    <td className="whitespace-nowrap p-2 text-right font-semibold">
                      {formatNumber(transaction.amount.toNumber())} kr.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
