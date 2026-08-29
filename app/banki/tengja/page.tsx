import Link from "next/link";
export default function TengjaBankareikningPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 Tengja bankareikning</h1>

      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <p className="text-sm text-gray-500">
          BANKATENGING
        </p>

        <h2 className="mt-2 text-xl font-semibold">
          Tengja bankareikning við virkt fyrirtæki
        </h2>

        <p className="mt-3 text-gray-600">
          Virkt fyrirtæki verður tengt bankareikningnum.
          Við munum ekki vista aðgangsorð eða bankalykilorð í GLÖGGT.
        </p>

        <div className="mt-6 rounded-lg border bg-gray-50 p-4">
          <p className="font-medium">Veldu banka</p>

          <Link
  href="/banki/tengja/islandsbanki"
  className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
>
  Íslandsbanki
</Link>
        </div>
      </div>
    </main>
  );
}