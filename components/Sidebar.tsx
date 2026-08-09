export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white p-6">
      <h1 className="text-2xl font-bold">GREITT</h1>
      <p className="text-slate-400 mt-1">Workspace</p>

      <nav className="mt-10 space-y-3">
        <div className="rounded-lg bg-slate-800 px-4 py-3">
          Yfirlit
        </div>

        <div className="px-4 py-3 text-slate-300">
          Fyrirtæki
        </div>

        <div className="px-4 py-3 text-slate-300">
          Fylgiskjöl
        </div>

        <div className="px-4 py-3 text-slate-300">
          Banki
        </div>

        <div className="px-4 py-3 text-slate-300">
          VSK og skil
        </div>

        <div className="px-4 py-3 text-slate-300">
          Innsýn
        </div>
      </nav>
    </aside>
  );
}