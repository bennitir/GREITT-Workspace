"use client";

export default function PrintQrButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-xl bg-slate-900 px-4 py-3 font-bold text-white print:hidden">
      {label}
    </button>
  );
}
