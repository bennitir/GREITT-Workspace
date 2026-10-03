"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { createDraftSaleAction } from "@/app/sala/actions";

type TerminalOption = {
  id: number;
  code: string;
  name: string;
  terminalType: string;
};

type BranchOption = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  city: string | null;
  terminals: TerminalOption[];
};

type Props = {
  branches: BranchOption[];
  text: {
    newSale: string;
    branch: string;
    terminal: string;
    noTerminal: string;
    startSale: string;
    starting: string;
    actionFailed: string;
  };
};

export default function SalesStartClient({ branches, text }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<number>(branches[0]?.id ?? 0);
  const [terminalId, setTerminalId] = useState<number | null>(null);

  const terminals = useMemo(
    () => branches.find((branch) => branch.id === branchId)?.terminals ?? [],
    [branchId, branches],
  );

  if (branches.length === 0) return null;

  function createSale() {
    setError(null);
    startTransition(async () => {
      try {
        const sale = await createDraftSaleAction({ branchId, terminalId });
        router.push(`/sala/${sale.id}`);
      } catch {
        setError(text.actionFailed);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">{text.newSale}</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>{text.branch}</span>
          <select
            value={branchId}
            onChange={(event) => {
              setBranchId(Number(event.target.value));
              setTerminalId(null);
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-700">
          <span>{text.terminal}</span>
          <select
            value={terminalId ?? ""}
            onChange={(event) =>
              setTerminalId(event.target.value ? Number(event.target.value) : null)
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
          >
            <option value="">{text.noTerminal}</option>
            {terminals.map((terminal) => (
              <option key={terminal.id} value={terminal.id}>
                {terminal.name} ({terminal.code})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={pending || !branchId}
          onClick={createSale}
          className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? text.starting : text.startSale}
        </button>
      </div>
      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </section>
  );
}
