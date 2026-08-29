"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-800 print:hidden"
    >
      Prenta hreyfingalista
    </button>
  );
}