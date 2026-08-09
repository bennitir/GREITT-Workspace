type Props = {
  name: string;
  pendingDocuments: number;
};

export default function CompanyCard({
  name,
  pendingDocuments,
}: Props) {
  return (
    <div className="mt-8 bg-white rounded-2xl p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-900">
        {name}
      </h3>

      <p className="text-slate-500 mt-1">
        {pendingDocuments} fylgiskjöl bíða vinnslu
      </p>

      <button className="mt-6 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-3 rounded-xl">
        Opna fyrirtæki
      </button>
    </div>
  );
}