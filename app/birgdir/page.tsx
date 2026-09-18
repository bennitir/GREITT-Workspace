import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import {
  inventoryFormatDate,
  inventoryFormatMoney,
  inventoryFormatNumber,
  inventoryMovementTypeText,
  inventoryText,
} from "@/lib/i18n/inventory";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { work10UnitText } from "@/lib/i18n/work10";
import { prisma } from "@/lib/prisma";
import {
  createInventoryItem,
  createInventoryLocation,
  recordInventoryAdjustment,
} from "./actions";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

const UNITS = ["PCS", "KG", "L", "M", "M2", "M3", "CUSTOM"] as const;

function stockOf(item: { movements: Array<{ quantityDelta: number }> }) {
  return item.movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
}

export default async function BirgdirPage({ searchParams }: Props) {
  const companyId = await requireCompanyModule("birgdir");
  const effectiveUser = await getEffectiveUser();
  const companyAccess = await getCompanyAccess(companyId);
  const params = await searchParams;
  const q = String(params.q ?? "").trim();

  const userSettings = effectiveUser
    ? await prisma.userSettings.findUnique({
        where: { userId: effectiveUser.id },
        select: { interfaceLanguage: true },
      })
    : null;
  const language = normalizeUiLanguage(userSettings?.interfaceLanguage ?? "is");
  const t = inventoryText(language);

  const [items, locations, recentMovements] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: {
        companyId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { sku: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: {
        movements: {
          where: { voidedAt: null },
          select: { quantityDelta: true, locationId: true },
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
  ]);

  const totalItems = items.length;
  const stockTracked = items.filter((item) => item.isStockTracked).length;
  const lowStock = items.filter((item) => {
    if (item.minStock === null) return false;
    return stockOf(item) < item.minStock;
  }).length;

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{t.title}</h1>
        <p className="mt-2 max-w-4xl text-sm text-slate-600">{t.intro}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  <th className="px-3 py-2 text-right">{t.stock}</th>
                  <th className="px-3 py-2 text-right">{t.minStock}</th>
                  <th className="px-3 py-2 text-right">{t.purchaseCost}</th>
                  <th className="px-3 py-2 text-right">{t.salePrice}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item) => {
                  const stock = stockOf(item);
                  const isLow = item.minStock !== null && stock < item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-mono text-xs">{item.sku}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold">{item.name}</p>
                        {item.description ? <p className="mt-1 text-xs text-slate-500">{item.description}</p> : null}
                      </td>
                      <td className="px-3 py-3">{work10UnitText(item.baseUnit, item.customUnit, language)}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${stock < 0 ? "text-rose-700" : isLow ? "text-amber-700" : ""}`}>
                        {inventoryFormatNumber(stock, language)}
                        {stock < 0 ? <span className="ml-2 text-xs">{t.negativeStock}</span> : isLow ? <span className="ml-2 text-xs">{t.belowMinimum}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-right">{item.minStock === null ? "—" : inventoryFormatNumber(item.minStock, language)}</td>
                      <td className="px-3 py-3 text-right">{inventoryFormatMoney(item.purchaseUnitCost, language)}</td>
                      <td className="px-3 py-3 text-right">{inventoryFormatMoney(item.saleUnitPrice, language)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {companyAccess.canWrite ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-2xl border bg-white p-4 lg:p-5">
            <h2 className="text-lg font-bold">{t.newItem}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{t.createItemHelp}</p>
            <form action={createInventoryItem} className="mt-4 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                  <span>{t.sku}</span>
                  <input name="sku" required maxLength={80} className="rounded-lg border px-3 py-2 text-sm" />
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
                  <span className="ml-2 text-xs text-slate-500">{location.code}</span>
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
                  <option value="VEHICLE">{t.vehicle}</option>
                  <option value="SITE">{t.site}</option>
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
                  {items.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
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
