import { previewBankStatement } from "@/app/banki/actions";
type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BankInnflutningurPage({ params }: Props) {
  const { id } = await params;

  return (
    <main className="p-8">
  <h1 className="text-2xl font-bold">
    📥 Flytja inn bankayfirlit
  </h1>

  <div className="mt-6 max-w-2xl rounded-lg border p-6">
    <p className="text-gray-600">
      Bankareikningur nr. {id}
    </p>

    <form action={previewBankStatement} className="mt-6">
        <input type="hidden" name="bankAccountId" value={id} />

      <label className="mb-2 block font-medium">
        Veldu XLSX bankayfirlit
      </label>

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
        Lesa bankayfirlit
      </button>
    </form>
  </div>
</main>
  );
}