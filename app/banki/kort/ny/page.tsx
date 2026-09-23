import Link from "next/link";
import { redirect } from "next/navigation";
import { createPaymentCard } from "@/app/banki/kort/actions";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";

export default async function NewPaymentCardPage() {
  const { companyId, t } = await paymentCardPageContext();
  if (!companyId) redirect("/fyrirtaeki");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">💳 {t.createTitle}</h1>

      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <p className="text-gray-600">{t.createHelp}</p>

        <form action={createPaymentCard} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block font-medium">{t.cardName}</label>
            <input
              name="name"
              required
              className="w-full rounded-lg border px-3 py-2"
              placeholder={t.cardNamePlaceholder}
            />
          </div>

          <div>
            <label className="mb-1 block font-medium">
              {t.issuer} <span className="font-normal text-gray-500">({t.optional})</span>
            </label>
            <input
              name="issuerName"
              className="w-full rounded-lg border px-3 py-2"
              placeholder={t.issuerPlaceholder}
            />
          </div>

          <div>
            <label className="mb-1 block font-medium">
              {t.network} <span className="font-normal text-gray-500">({t.optional})</span>
            </label>
            <input
              name="network"
              className="w-full rounded-lg border px-3 py-2"
              placeholder={t.networkPlaceholder}
            />
          </div>

          <div>
            <label className="mb-1 block font-medium">
              {t.lastFour} <span className="font-normal text-gray-500">({t.optional})</span>
            </label>
            <input
              name="lastFour"
              inputMode="numeric"
              maxLength={4}
              className="w-full rounded-lg border px-3 py-2"
              placeholder="1234"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
              type="submit"
            >
              {t.saveCard}
            </button>
            <Link href="/banki" className="rounded-lg border px-4 py-2 font-medium">
              ← {t.sectionTitle}
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
