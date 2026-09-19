import Link from "next/link";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import {
  inventoryCommitmentTypeText,
  inventoryFormatDate,
  inventoryFormatMoney,
  inventoryFormatNumber,
  inventoryLocationKindText,
  inventoryMovementTypeText,
  inventoryReasonText,
  inventoryText,
} from "@/lib/i18n/inventory";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { stocktakeMobileText } from "@/lib/i18n/stocktake-mobile";
import { work10UnitText } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import {
  createInventoryCommitment,
  createInventoryItem,
  createInventoryLocation,
  recordInventoryAdjustment,
  recordInventoryTransfer,
  releaseInventoryCommitment,
  recordInventoryLoss,
  recordInventoryStocktake,
  updateInventoryItem,
} from "./actions";

type Props = {
  searchParams: Promise<{ q?: string; edit?: string }>;
};

const UNITS = ["PCS", "KG", "L", "M", "M2", "M3", "CUSTOM"] as const;

function stockOf(item: { movements: Array<{ quantityDelta: number }> }) {
  return item.movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
}

function committedOf(item: { commitments: Array<{ quantity: number }> }) {
  return item.commitments.reduce((sum, commitment) => sum + commitment.quantity, 0);
}

function inventoryValueOf(item: {
  isStockTracked: boolean;
  purchaseUnitCost: number | null;
  movements: Array<{ quantityDelta: number }>;
}) {
  if (!item.isStockTracked || item.purchaseUnitCost === null) return null;
  return stockOf(item) * item.purchaseUnitCost;
}

export default async function BirgdirPage({ searchParams }: Props) {
  const companyId = await requireCompanyModule("birgdir");
  const effectiveUser = await getEffectiveUser();
  const companyAccess = await getCompanyAccess(companyId);
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const editItemId = Number(params.edit ?? 0);

  const userSettings = effectiveUser
    ? await prisma.userSettings.findUnique({
        where: { userId: effectiveUser.id },
        select: { interfaceLanguage: true },
      })
    : null;
  const language = normalizeUiLanguage(userSettings?.interfaceLanguage ?? "is");
  const t = inventoryText(language);
  const countT = stocktakeMobileText(language);

  const [items, locations, recentMovements, recentStocktakes, activeCommitments] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        companyId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
                { barcode: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        movements: {
          where: { voidedAt: null },
          select: { quantityDelta: true, locationId: true },
        },
        commitments: {
          where: { status: "ACTIVE" },
          select: { quantity: true, locationId: true },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.inventoryLocation.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    prisma.inventoryMovement.findMany({
      where: { companyId, voidedAt: null },
      include: {
        item: { select: { sku: true, name: true } },
        location: { select: { code: true, name: true } },
      },
      orderBy: [{ movementAt: "desc" }, { id: "desc" }],
      take: 30,
    }),
    prisma.inventoryStocktake.findMany({
      where: { companyId },
      include: {
        item: { select: { sku: true, name: true } },
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ countedAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.inventoryCommitment.findMany({
      where: { companyId, status: "ACTIVE" },
      include: {
        item: { select: { sku: true, name: true, baseUnit: true, customUnit: true } },
        location: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    }),
  ]);

  const pendingHandheldCounts = await prisma.inventoryCountSession.count({
    where: { companyId, status: "REVIEW" },
  });

  const editItem = Number.isInteger(editItemId) && editItemId > 0 ? items.find((item) => item.id === editItemId) ?? null : null;
  const totalItems = items.length;
  const stockTracked = items.filter((item) => item.isStockTracked).length;
  const lowStock = items.filter((item) => {
    if (!item.isStockTracked || item.minStock === null) return false;
    return stockOf(item) - committedOf(item) < item.minStock;
  }).length;
  const inventoryValue = items.reduce((sum, item) => {
    const value = inventoryValueOf(item);
    return value === null ? sum : sum + value;
  }, 0);
  const stockItemsMissingCost = items.filter((item) =>
    item.isStockTracked &&
    item.purchaseUnitCost === null &&
    Math.abs(stockOf(item)) > 1e-9
  ).length;

  const positionRows = items.flatMap((item) => {
    if (!item.isStockTracked) return [];
    return locations.flatMap((location) => {
      const onHand = item.movements
        .filter((movement) => movement.locationId === location.id)
        .reduce((sum, movement) => sum + movement.quantityDelta, 0);
      const committed = item.commitments
        .filter((commitment) => commitment.locationId === location.id)
        .reduce((sum, commitment) => sum + commitment.quantity, 0);
      if (Math.abs(onHand) <= 1e-9 && Math.abs(committed) <= 1e-9) return [];
      const inventoryValue = item.purchaseUnitCost === null ? null : onHand * item.purchaseUnitCost;
      return [{ item, location, onHand, committed, available: onHand - committed, inventoryValue }];
    });
  });

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{t.title}</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">{t.intro}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          [t.items, totalItems],
          [t.stockTracked, stockTracked],
          [t.locations, locations.length],
          [t.lowStock, lowStock],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </div>
        ))}
        <div className="rounded-2xl border bg-white p-4">
          <p className="text-xs font-medium text-slate-500">{t.inventoryValue}</p>
          <p className="mt-1 text-2xl font-bold">{inventoryFormatMoney(inventoryValue, language)}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{t.inventoryValueHelp}</p>
          {stockItemsMissingCost > 0 ? (
            <p className="mt-2 text-[11px] font-semibold text-amber-700">
              {t.inventoryValueMissingCost}: {stockItemsMissingCost}
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 lg:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">{countT.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{countT.reviewHelp}</p>
          </div>
          <Link href="/birgdir/vorutalningar" className="rounded-xl bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white">
            {countT.reviewTitle}{pendingHandheldCounts > 0 ? ` (${pendingHandheldCounts})` : ""}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-4 lg:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold">{t.itemRegister}</h2>
            <p className="mt-1 text-sm text-slate-500">{t.intro}</p>
          </div>
          <form method="get" className="flex gap-2">
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              <span>{t.searchItems}</span>
              <input
                name="q"
                defaultValue={q}
                placeholder={t.searchPlaceholder}
                className="min-w-64 rounded-lg border bg-white px-3 py-2 text-sm"
              />
            </label>
            <button className="self-end rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
              {t.searchItems}
            </button>
          </form>
        </div>

        {items.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t.noItems}</p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t.sku}</th>
                  <th className="px-3 py-2">{t.name}</th>
                  <th className="px-3 py-2">{t.unit}</th>
                  <th className="px-3 py-2 text-right">{t.onHand}</th>
                  <th className="px-3 py-2 text-right">{t.committed}</th>
                  <th className="px-3 py-2 text-right">{t.availableStock}</th>
                  <th className="px-3 py-2 text-right">{t.inventoryValue}</th>
                  <th className="px-3 py-2 text-right">{t.minStock}</th>
                  <th className="px-3 py-2 text-right">{t.purchaseCost}</th>
                  <th className="px-3 py-2 text-right">{t.inventoryValue}</th>
                  <th className="px-3 py-2 text-right">{t.salePrice}</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const stock = stockOf(item);
                  const committed = committedOf(item);
                  const available = stock - committed;
                  const itemInventoryValue = inventoryValueOf(item);
                  const isLow = item.minStock !== null && available < item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-mono text-xs">
                        <div>{item.sku}</div>
                        {item.barcode ? <div className="mt-1 text-[11px] text-slate-500">{item.barcode}</div> : null}
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold">{item.name}</p>
                        {item.description ? <p className="mt-1 text-xs text-slate-500">{item.description}</p> : null}
                      </td>
                      <td className="px-3 py-3">{work10UnitText(item.baseUnit, item.customUnit, language)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${item.isStockTracked && stock < 0 ? "text-rose-700" : ""}`}>
                        {item.isStockTracked ? inventoryFormatNumber(stock, language) : <span className="text-xs font-medium text-slate-500">{t.stockNotApplicable}</span>}
                      </td>
                      <td className="px-3 py-3 text-right">{item.isStockTracked ? inventoryFormatNumber(committed, language) : "—"}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${item.isStockTracked && available < 0 ? "text-rose-700" : isLow ? "text-amber-700" : ""}`}>
                        {item.isStockTracked ? (
                          <>
                            {inventoryFormatNumber(available, language)}
                            {available < 0 ? <span className="ml-2 text-xs">{t.negativeStock}</span> : isLow ? <span className="ml-2 text-xs">{t.belowMinimum}</span> : null}
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-3 text-right">{item.minStock === null ? "—" : inventoryFormatNumber(item.minStock, language)}</td>
                      <td className="px-3 py-3 text-right">{inventoryFormatMoney(item.purchaseUnitCost, language)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{inventoryFormatMoney(itemInventoryValue, language)}</td>
                      <td className="px-3 py-3 text-right">{inventoryFormatMoney(item.saleUnitPrice, language)}</td>
                      <td className="px-3 py-3 text-right">
                        {companyAccess.canWrite ? (
                          <Link href={`/birgdir?${new URLSearchParams({ ...(q ? { q } : {}), edit: String(item.id) }).toString()}`} className="text-xs font-semibold text-blue-700 hover:underline">
                            {t.editItem}
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 lg:p-5">
        <h2 className="text-lg font-bold">{t.positionSection}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t.positionHelp}</p>
        {positionRows.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">—</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t.item}</th>
                  <th className="px-3 py-2">{t.location}</th>
                  <th className="px-3 py-2 text-right">{t.onHand}</th>
                  <th className="px-3 py-2 text-right">{t.committed}</th>
                  <th className="px-3 py-2 text-right">{t.availableStock}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positionRows.map(({ item, location, onHand, committed, available, inventoryValue }) => (
                  <tr key={`${item.id}:${location.id}`}>
                    <td className="px-3 py-2"><span className="font-semibold">{item.name}</span><span className="ml-2 text-xs text-slate-500">{item.sku}</span></td>
                    <td className="px-3 py-2">{location.name}</td>
                    <td className="px-3 py-2 text-right font-semibold">{inventoryFormatNumber(onHand, language)}</td>
                    <td className="px-3 py-2 text-right">{inventoryFormatNumber(committed, language)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${available < 0 ? "text-rose-700" : ""}`}>{inventoryFormatNumber(available, language)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{inventoryFormatMoney(inventoryValue, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {companyAccess.canWrite && editItem ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 lg:p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{t.editItemTitle}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">{t.editItemHelp}</p>
            </div>
            <Link href={`/birgdir${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="text-sm font-semibold text-slate-600 hover:underline">
              {t.cancelEdit}
            </Link>
          </div>
          <form action={updateInventoryItem} className="mt-4 grid gap-3">
            <input type="hidden" name="itemId" value={editItem.id} />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.sku}</span>
                <input value={editItem.sku} readOnly className="rounded-lg border bg-slate-100 px-3 py-2 text-sm text-slate-500" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.barcode}</span>
                <input name="barcode" maxLength={120} defaultValue={editItem.barcode ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.name}</span>
                <input name="name" required maxLength={180} defaultValue={editItem.name} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-medium text-slate-600">
              <span>{t.description}</span>
              <textarea name="description" maxLength={2000} rows={2} defaultValue={editItem.description ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
            </label>
            <label className="rounded-lg border bg-white px-3 py-3 text-sm">
              <span className="flex items-center gap-2 font-semibold text-slate-800">
                <input name="isStockTracked" type="checkbox" defaultChecked={editItem.isStockTracked} className="h-4 w-4" />
                {t.stockTrackingLabel}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{t.stockTrackingHelp}</span>
            </label>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.baseUnit}</span>
                <select name="baseUnit" defaultValue={editItem.baseUnit} className="rounded-lg border bg-white px-3 py-2 text-sm">
                  {UNITS.map((unit) => <option key={unit} value={unit}>{work10UnitText(unit, null, language)}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.customUnit}</span>
                <input name="customUnit" maxLength={40} defaultValue={editItem.customUnit ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.minStock}</span>
                <input name="minStock" inputMode="decimal" defaultValue={editItem.minStock ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.purchaseCost}</span>
                <input name="purchaseUnitCost" inputMode="decimal" defaultValue={editItem.purchaseUnitCost ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.salePrice}</span>
                <input name="saleUnitPrice" inputMode="decimal" defaultValue={editItem.saleUnitPrice ?? ""} className="rounded-lg border bg-white px-3 py-2 text-sm" />
              </label>
            </div>
            <button className="w-fit rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">{t.saveItem}</button>
          </form>
        </section>
      ) : null}

      {companyAccess.canWrite ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.newItem}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t.createItemHelp}</p>
            <form action={createInventoryItem} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.sku}</span>
                  <input name="sku" required maxLength={80} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.barcode}</span>
                  <input name="barcode" maxLength={120} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.name}</span>
                  <input name="name" required maxLength={180} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.description}</span>
                <textarea name="description" maxLength={2000} rows={2} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <label className="rounded-lg border bg-slate-50 px-3 py-3 text-sm">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <input name="isStockTracked" type="checkbox" defaultChecked className="h-4 w-4" />
                  {t.stockTrackingLabel}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{t.stockTrackingHelp}</span>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.baseUnit}</span>
                  <select name="baseUnit" defaultValue="PCS" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    {UNITS.map((unit) => <option key={unit} value={unit}>{work10UnitText(unit, null, language)}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.customUnit}</span>
                  <input name="customUnit" maxLength={40} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.minStock}</span>
                  <input name="minStock" inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.purchaseCost}</span>
                  <input name="purchaseUnitCost" inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.salePrice}</span>
                  <input name="saleUnitPrice" inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.openingStock}</span>
                  <input name="openingQuantity" inputMode="decimal" defaultValue="0" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.openingLocation}</span>
                  <select name="locationId" defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="">{t.defaultLocationName}</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
              </div>
              <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                {t.createItem}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.locationSection}</h2>
            <div className="mt-3 space-y-2">
              {locations.map((location) => (
                <div key={location.id} className="rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-semibold">{location.name}</span>
                  <span className="ml-2 text-xs text-slate-500">{location.code} · {inventoryLocationKindText(location.kind, language)}</span>
                </div>
              ))}
            </div>
            <form action={createInventoryLocation} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.locationCode}</span>
                  <input name="code" required maxLength={60} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.locationName}</span>
                  <input name="name" required maxLength={160} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.locationKind}</span>
                <select name="kind" defaultValue="WAREHOUSE" className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="WAREHOUSE">{t.warehouse}</option>
                  <option value="STORE">{t.store}</option>
                  <option value="STAGING">{t.staging}</option>
                  <option value="VEHICLE">{t.vehicle}</option>
                  <option value="SITE">{t.site}</option>
                  <option value="TRANSIT">{t.transit}</option>
                  <option value="OTHER">{t.other}</option>
                </select>
              </label>
              <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{t.createLocation}</button>
            </form>
          </section>

          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.movementSection}</h2>
            <form action={recordInventoryAdjustment} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.item}</span>
                <select name="itemId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="" disabled>—</option>
                  {items.filter((item) => item.isActive && item.isStockTracked).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.location}</span>
                <select name="locationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="" disabled>—</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.movementDirection}</span>
                  <select name="direction" defaultValue="IN" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="IN">{t.stockIn}</option>
                    <option value="OUT">{t.stockOut}</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.quantity}</span>
                  <input name="quantity" required inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.note}</span>
                <input name="note" maxLength={1000} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{t.recordMovement}</button>
            </form>
          </section>
        </div>
      ) : null}

      {companyAccess.canWrite ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.transferSection}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t.transferHelp}</p>
            <form action={recordInventoryTransfer} className="mt-4 grid gap-3">
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.item}</span>
                <select name="itemId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="" disabled>—</option>
                  {items.filter((item) => item.isActive && item.isStockTracked).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.fromLocation}</span>
                  <select name="fromLocationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.toLocation}</span>
                  <select name="toLocationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.transferQuantity}</span>
                <input name="quantity" required inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.note}</span>
                <input name="note" maxLength={1000} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <button className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">{t.recordTransfer}</button>
            </form>
          </section>

          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.commitmentSection}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t.commitmentHelp}</p>
            <form action={createInventoryCommitment} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.item}</span>
                  <select name="itemId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {items.filter((item) => item.isActive && item.isStockTracked).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.location}</span>
                  <select name="locationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.commitmentQuantity}</span>
                  <input name="quantity" required inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.commitmentType}</span>
                  <select name="commitmentType" defaultValue="RESERVATION" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="RESERVATION">{t.reservation}</option>
                    <option value="SALE_PENDING">{t.salePending}</option>
                    <option value="OTHER">{t.otherCommitment}</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.note}</span>
                <input name="note" maxLength={1000} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <button className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800">{t.recordCommitment}</button>
            </form>

            <div className="mt-5 border-t pt-4">
              <h3 className="text-sm font-bold">{t.activeCommitments}</h3>
              {activeCommitments.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">{t.noCommitments}</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {activeCommitments.map((commitment) => (
                    <div key={commitment.id} className="flex items-start justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold">{commitment.item.name} · {inventoryFormatNumber(commitment.quantity, language)} {work10UnitText(commitment.item.baseUnit, commitment.item.customUnit, language)}</p>
                        <p className="mt-1 text-xs text-slate-500">{inventoryCommitmentTypeText(commitment.commitmentType, language)} · {commitment.location.name}{commitment.note ? ` · ${commitment.note}` : ""}</p>
                      </div>
                      <form action={releaseInventoryCommitment}>
                        <input type="hidden" name="commitmentId" value={commitment.id} />
                        <button className="text-xs font-semibold text-blue-700 hover:underline">{t.releaseCommitment}</button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {companyAccess.canWrite ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.stocktakeSection}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t.stocktakeHelp}</p>
            <form action={recordInventoryStocktake} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.item}</span>
                  <select name="itemId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {items.filter((item) => item.isActive && item.isStockTracked).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.location}</span>
                  <select name="locationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.countedAt}</span>
                  <input name="countedAt" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.countedStock}</span>
                  <input name="countedQuantity" required inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.reason}</span>
                <select name="reasonCode" defaultValue="COUNT_VARIANCE" className="rounded-lg border bg-white px-3 py-2 text-sm">
                  <option value="COUNT_VARIANCE">{t.countVariance}</option>
                  <option value="SHRINKAGE">{t.shrinkage}</option>
                  <option value="DAMAGE">{t.damage}</option>
                  <option value="SPOILAGE">{t.spoilage}</option>
                  <option value="THEFT">{t.theft}</option>
                  <option value="OBSOLETE">{t.obsolete}</option>
                  <option value="OTHER">{t.otherReason}</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.note}</span>
                <input name="note" maxLength={1000} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <button className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">{t.recordStocktake}</button>
            </form>
          </section>

          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.lossSection}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t.lossHelp}</p>
            <form action={recordInventoryLoss} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.item}</span>
                  <select name="itemId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {items.filter((item) => item.isActive && item.isStockTracked).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.location}</span>
                  <select name="locationId" required defaultValue="" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="" disabled>—</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.lossQuantity}</span>
                  <input name="quantity" required inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm" />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.reason}</span>
                  <select name="reasonCode" defaultValue="SHRINKAGE" className="rounded-lg border bg-white px-3 py-2 text-sm">
                    <option value="SHRINKAGE">{t.shrinkage}</option>
                    <option value="DAMAGE">{t.damage}</option>
                    <option value="SPOILAGE">{t.spoilage}</option>
                    <option value="THEFT">{t.theft}</option>
                    <option value="OBSOLETE">{t.obsolete}</option>
                    <option value="OTHER">{t.otherReason}</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-xs font-medium text-slate-600">
                <span>{t.note}</span>
                <input name="note" maxLength={1000} className="rounded-lg border px-3 py-2 text-sm" />
              </label>
              <button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800">{t.recordLoss}</button>
            </form>
          </section>
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 lg:p-5">
        <h2 className="text-lg font-bold">{t.stocktakeHistory}</h2>
        {recentStocktakes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t.noStocktakes}</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t.date}</th>
                  <th className="px-3 py-2">{t.item}</th>
                  <th className="px-3 py-2">{t.location}</th>
                  <th className="px-3 py-2 text-right">{t.expectedStock}</th>
                  <th className="px-3 py-2 text-right">{t.countedStock}</th>
                  <th className="px-3 py-2 text-right">{t.variance}</th>
                  <th className="px-3 py-2">{t.reason}</th>
                  <th className="px-3 py-2">{t.note}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentStocktakes.map((stocktake) => (
                  <tr key={stocktake.id}>
                    <td className="px-3 py-2">{inventoryFormatDate(stocktake.countedAt, language)}</td>
                    <td className="px-3 py-2"><span className="font-semibold">{stocktake.item.name}</span><span className="ml-2 text-xs text-slate-500">{stocktake.item.sku}</span></td>
                    <td className="px-3 py-2">{stocktake.location.name}</td>
                    <td className="px-3 py-2 text-right">{inventoryFormatNumber(stocktake.expectedQuantity, language)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{inventoryFormatNumber(stocktake.countedQuantity, language)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${stocktake.varianceQuantity < 0 ? "text-rose-700" : stocktake.varianceQuantity > 0 ? "text-emerald-700" : ""}`}>
                      {stocktake.varianceQuantity > 0 ? "+" : ""}{inventoryFormatNumber(stocktake.varianceQuantity, language)}
                    </td>
                    <td className="px-3 py-2">{inventoryReasonText(stocktake.reasonCode, language)}</td>
                    <td className="px-3 py-2 text-slate-500">{stocktake.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 lg:p-5">
        <h2 className="text-lg font-bold">{t.recentMovements}</h2>
        {recentMovements.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">—</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">{t.date}</th>
                  <th className="px-3 py-2">{t.item}</th>
                  <th className="px-3 py-2">{t.location}</th>
                  <th className="px-3 py-2">{t.movementType}</th>
                  <th className="px-3 py-2 text-right">{t.quantity}</th>
                  <th className="px-3 py-2">{t.reason}</th>
                  <th className="px-3 py-2">{t.note}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentMovements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="px-3 py-2">{inventoryFormatDate(movement.movementAt, language)}</td>
                    <td className="px-3 py-2"><span className="font-semibold">{movement.item.name}</span><span className="ml-2 text-xs text-slate-500">{movement.item.sku}</span></td>
                    <td className="px-3 py-2">{movement.location.name}</td>
                    <td className="px-3 py-2">{inventoryMovementTypeText(movement.movementType, language)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${movement.quantityDelta < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {movement.quantityDelta > 0 ? "+" : ""}{inventoryFormatNumber(movement.quantityDelta, language)}
                    </td>
                    <td className="px-3 py-2">{inventoryReasonText(movement.reasonCode, language)}</td>
                    <td className="px-3 py-2 text-slate-500">{movement.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
