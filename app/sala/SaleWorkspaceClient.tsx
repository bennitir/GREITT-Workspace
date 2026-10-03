"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import {
  addFreeSaleLineAction,
  finalizeSaleAction,
  holdSaleAction,
  removeSaleLineAction,
  resumeSaleAction,
  voidSaleAction,
} from "@/app/sala/actions";
import type { SaleStatus } from "@/lib/core/sales-domain";

type SaleLineView = {
  id: number;
  position: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotalAmount: string;
  discountAmount: string;
  netAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
};

type SaleView = {
  id: number;
  status: SaleStatus;
  currency: string;
  subtotalAmount: string;
  discountAmount: string;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
  branch: { id: number; code: string; name: string };
  terminal: { id: number; code: string; name: string } | null;
  lines: SaleLineView[];
};

type Text = {
  status: string;
  branch: string;
  terminal: string;
  noTerminal: string;
  lines: string;
  noLines: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discount: string;
  vatRate: string;
  subtotal: string;
  net: string;
  vat: string;
  total: string;
  addLine: string;
  addingLine: string;
  remove: string;
  removing: string;
  hold: string;
  holding: string;
  resume: string;
  resuming: string;
  finalize: string;
  finalizing: string;
  voidSale: string;
  voidingSale: string;
  voidConfirm: string;
  voidedHelp: string;
  finalizedHelp: string;
  heldHelp: string;
  discountPermission: string;
  actionFailed: string;
  invalidLine: string;
  statuses: Record<SaleStatus, string>;
};

function money(value: string, currency: string) {
  return `${value} ${currency}`;
}

export default function SaleWorkspaceClient({
  sale,
  permissions,
  text,
}: {
  sale: SaleView;
  permissions: { canHold: boolean; canDiscount: boolean; canVoid: boolean };
  text: Text;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const mutable = sale.status === "DRAFT";

  function refreshAfter(operation: () => Promise<unknown>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await operation();
        onSuccess?.();
        router.refresh();
      } catch {
        setError(text.actionFailed);
      }
    });
  }

  function addLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      const description = String(data.get("description") ?? "").trim();
      const quantity = String(data.get("quantity") ?? "").trim();
      const unit = String(data.get("unit") ?? "").trim();
      const unitPrice = String(data.get("unitPrice") ?? "").trim();
      const discountAmount = permissions.canDiscount
        ? String(data.get("discountAmount") ?? "0").trim() || "0"
        : "0";
      const vatRate = String(data.get("vatRate") ?? "").trim();

      if (!description || !unit) throw new Error("INVALID_LINE");

      setError(null);
      startTransition(async () => {
        try {
          await addFreeSaleLineAction({
            saleId: sale.id,
            description,
            quantity,
            unit,
            unitPrice,
            discountAmount,
            vatRate,
          });
          form.reset();
          router.refresh();
        } catch {
          setError(text.actionFailed);
        }
      });
    } catch {
      setError(text.invalidLine);
    }
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.status}</p>
          <p className="mt-1 font-bold text-slate-900">{text.statuses[sale.status]}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.branch}</p>
          <p className="mt-1 font-semibold text-slate-900">{sale.branch.name}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.terminal}</p>
          <p className="mt-1 font-semibold text-slate-900">{sale.terminal?.name ?? text.noTerminal}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.total}</p>
          <p className="mt-1 text-xl font-black text-slate-950">{money(sale.totalAmount, sale.currency)}</p>
        </div>
      </section>

      {sale.status === "HELD" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{text.heldHelp}</p>
      ) : null}
      {sale.status === "FINALIZED" ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{text.finalizedHelp}</p>
      ) : null}
      {sale.status === "CANCELLED" ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{text.voidedHelp}</p>
      ) : null}
      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p> : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{text.lines}</h2>
        </div>

        {sale.lines.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">{text.noLines}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">{text.description}</th>
                  <th className="px-4 py-3">{text.quantity}</th>
                  <th className="px-4 py-3">{text.unit}</th>
                  <th className="px-4 py-3">{text.unitPrice}</th>
                  <th className="px-4 py-3">{text.discount}</th>
                  <th className="px-4 py-3">{text.vat}</th>
                  <th className="px-4 py-3">{text.total}</th>
                  {mutable ? <th className="px-4 py-3" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3 text-slate-500">{line.position}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{line.description}</td>
                    <td className="px-4 py-3">{line.quantity}</td>
                    <td className="px-4 py-3">{line.unit}</td>
                    <td className="px-4 py-3">{money(line.unitPrice, sale.currency)}</td>
                    <td className="px-4 py-3">{money(line.discountAmount, sale.currency)}</td>
                    <td className="px-4 py-3">{money(line.vatAmount, sale.currency)} ({line.vatRate}%)</td>
                    <td className="px-4 py-3 font-bold">{money(line.totalAmount, sale.currency)}</td>
                    {mutable ? (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            refreshAfter(() =>
                              removeSaleLineAction({ saleId: sale.id, lineId: line.id }),
                            )
                          }
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {pending ? text.removing : text.remove}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {mutable ? (
          <form onSubmit={addLine} className="grid gap-3 border-t border-slate-200 bg-slate-50 p-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 xl:col-span-2">
              <span className="text-xs font-semibold text-slate-600">{text.description}</span>
              <input name="description" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{text.quantity}</span>
              <input name="quantity" inputMode="decimal" defaultValue="1" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{text.unit}</span>
              <input name="unit" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{text.unitPrice}</span>
              <input name="unitPrice" inputMode="decimal" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{text.vatRate}</span>
              <input name="vatRate" inputMode="decimal" defaultValue="24" required className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-600">{text.discount}</span>
              <input
                name="discountAmount"
                inputMode="decimal"
                defaultValue="0"
                disabled={!permissions.canDiscount}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              />
            </label>
            {!permissions.canDiscount ? (
              <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-3">{text.discountPermission}</p>
            ) : null}
            <div className="flex items-end xl:col-span-2">
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded-xl bg-slate-950 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              >
                {pending ? text.addingLine : text.addLine}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.subtotal}</p>
          <p className="mt-1 font-bold">{money(sale.subtotalAmount, sale.currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.discount}</p>
          <p className="mt-1 font-bold">{money(sale.discountAmount, sale.currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.net}</p>
          <p className="mt-1 font-bold">{money(sale.netAmount, sale.currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.vat}</p>
          <p className="mt-1 font-bold">{money(sale.vatAmount, sale.currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.total}</p>
          <p className="mt-1 text-xl font-black">{money(sale.totalAmount, sale.currency)}</p>
        </div>
      </section>

      {sale.status === "DRAFT" || sale.status === "HELD" ? (
        <div className="flex flex-wrap justify-end gap-3">
          {sale.status === "DRAFT" && permissions.canHold ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => refreshAfter(() => holdSaleAction({ saleId: sale.id }))}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold disabled:opacity-50"
            >
              {pending ? text.holding : text.hold}
            </button>
          ) : null}
          {sale.status === "HELD" && permissions.canHold ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => refreshAfter(() => resumeSaleAction({ saleId: sale.id }))}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold disabled:opacity-50"
            >
              {pending ? text.resuming : text.resume}
            </button>
          ) : null}
          {permissions.canVoid ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(text.voidConfirm)) return;
                refreshAfter(() => voidSaleAction({ saleId: sale.id }));
              }}
              className="rounded-xl border border-red-300 bg-white px-4 py-2.5 font-semibold text-red-700 disabled:opacity-50"
            >
              {pending ? text.voidingSale : text.voidSale}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || sale.lines.length === 0}
            onClick={() => refreshAfter(() => finalizeSaleAction({ saleId: sale.id }))}
            className="rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? text.finalizing : text.finalize}
          </button>
        </div>
      ) : null}
    </div>
  );
}
