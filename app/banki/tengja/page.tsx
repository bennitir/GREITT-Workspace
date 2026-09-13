import Link from "next/link";

export default function TengjaBankareikningPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 Bankareikningur</h1>
      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <p className="text-sm text-gray-500">BANKI</p>
        <h2 className="mt-2 text-xl font-semibold">Bæta bankareikningi við fyrirtækið</h2>
        <p className="mt-3 text-gray-600">
          Skráðu reikning til að geta flutt inn bankayfirlit. Þetta stofnar ekki lifandi bankatengingu og GLÖGGT biður ekki um bankalykilorð.
        </p>
        <Link href="/banki/tengja/skra" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">
          + Skrá bankareikning
        </Link>
      </div>
    </main>
  );
}
