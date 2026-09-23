import Link from "next/link";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";

export default async function TengjaBankareikningPage() {
  const { t } = await paymentCardPageContext();

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 Banki</h1>

      <div className="mt-6 grid max-w-5xl gap-6 lg:grid-cols-2">
        <div className="rounded-lg border p-6">
          <p className="text-sm text-gray-500">BANKI</p>
          <h2 className="mt-2 text-xl font-semibold">Bæta bankareikningi við fyrirtækið</h2>
          <p className="mt-3 text-gray-600">
            Skráðu reikning til að geta flutt inn bankayfirlit. Þetta stofnar ekki lifandi bankatengingu og GLÖGGT biður ekki um bankalykilorð.
          </p>
          <Link
            href="/banki/tengja/skra"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            + Skrá bankareikning
          </Link>
        </div>

        <div className="rounded-lg border p-6">
          <p className="text-sm text-gray-500">{t.sectionTitle.toUpperCase()}</p>
          <h2 className="mt-2 text-xl font-semibold">{t.addCard.replace(/^\+\s*/, "")}</h2>
          <p className="mt-3 text-gray-600">{t.sectionHelp}</p>
          <Link
            href="/banki/kort/ny"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            {t.addCard}
          </Link>
        </div>
      </div>
    </main>
  );
}
