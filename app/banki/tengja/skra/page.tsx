import { createBankAccount } from "@/app/banki/actions";

export default function SkraBankareikningPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 Skrá bankareikning</h1>
      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <p className="text-gray-600">Reikningurinn verður skráður á virkt fyrirtæki. IBAN er valfrjálst fyrir söguleg bankayfirlit.</p>
        <form action={createBankAccount} className="mt-6 space-y-4">
          <div><label className="mb-1 block font-medium">Heiti reiknings</label><input name="name" required className="w-full rounded-lg border px-3 py-2" placeholder="Aðalreikningur" /></div>
          <div><label className="mb-1 block font-medium">Banki</label><input name="bankName" required className="w-full rounded-lg border px-3 py-2" placeholder="Landsbankinn" /></div>
          <div><label className="mb-1 block font-medium">Reikningsnúmer</label><input name="accountNumber" required className="w-full rounded-lg border px-3 py-2" placeholder="0157-26-100050" /></div>
          <div><label className="mb-1 block font-medium">IBAN <span className="font-normal text-gray-500">(valfrjálst)</span></label><input name="iban" className="w-full rounded-lg border px-3 py-2" placeholder="IS..." /></div>
          <button className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white" type="submit">Vista bankareikning</button>
        </form>
      </div>
    </main>
  );
}
