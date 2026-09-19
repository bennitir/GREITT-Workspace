import {
  receiveDocumentInventoryLine,
  reopenDocumentInventoryLine,
  skipDocumentInventoryLine,
} from "@/app/actions/receiptActions";
import {
  inventoryFormatMoney,
  inventoryFormatNumber,
} from "@/lib/i18n/inventory";
import { receiptInventoryText } from "@/lib/i18n/receipt-inventory";

type InventoryLine = {
  id: number;
  description: string;
  supplierItemCode: string | null;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  stockCandidate: boolean;
  extractionSource: string;
  extractionConfidence: number | null;
  matchedItemId: number | null;
  matchSource: string | null;
  matchConfidence: number | null;
  locationId: number | null;
  status: string;
  receivedAt: Date | string | null;
  skipReason: string | null;
  matchedItem: { id: number; sku: string; name: string; baseUnit: string } | null;
  location: { id: number; code: string; name: string } | null;
  movement: { id: number; quantityDelta: number; unitCost: number | null } | null;
};

type Props = {
  language: string;
  lines: InventoryLine[];
  items: Array<{
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    baseUnit: string;
  }>;
  locations: Array<{ id: number; code: string; name: string }>;
  duplicateBlocked: boolean;
  canEdit: boolean;
};

function matchLabel(source: string | null, t: ReturnType<typeof receiptInventoryText>) {
  if (source === "BARCODE") return t.exactBarcode;
  if (source === "SKU") return t.sku;
  if (source === "EXACT_NAME") return t.exactName;
  if (source === "PRIOR_CONFIRMED_SUPPLIER_CODE") return t.priorSupplierCode;
  if (source === "USER_CONFIRMED") return t.userConfirmed;
  if (source === "USER_OVERRIDE") return t.userOverride;
  return null;
}

export default function DocumentInventoryReview({
  language,
  lines,
  items,
  locations,
  duplicateBlocked,
  canEdit,
}: Props) {
  if (lines.length === 0) return null;

  const t = receiptInventoryText(language);
  const defaultLocationId = locations[0]?.id ?? "";

  return (
    <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-emerald-950">{t.title}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-emerald-900/80">{t.help}</p>
        </div>
      </div>

      {duplicateBlocked && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.duplicateBlocked}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {lines.map((line) => {
          const matchedBy = matchLabel(line.matchSource, t);
          const received = line.status === "RECEIVED";
          const skipped = line.status === "SKIPPED";
          const effectiveQuantity = line.movement?.quantityDelta ?? line.quantity;
          const effectiveUnitCost = line.movement?.unitCost ?? line.unitPrice;

          return (
            <article key={line.id} className="rounded-lg border bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{line.description}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    {line.supplierItemCode && <span>{t.supplierCode}: {line.supplierItemCode}</span>}
                    {line.barcode && <span>{t.barcode}: {line.barcode}</span>}
                    {line.quantity !== null && (
                      <span>{t.readQuantity}: {inventoryFormatNumber(line.quantity, language)} {line.unit ?? ""}</span>
                    )}
                    {line.lineTotal !== null && <span>{t.lineTotal}: {inventoryFormatMoney(line.lineTotal, language)}</span>}
                    <span>{line.extractionSource === "AI_FROM_SOURCE_TEXT" ? t.sourceText : t.sourceVision}</span>
                    {line.extractionConfidence !== null && (
                      <span>{t.confidence}: {Math.round(line.extractionConfidence * 100)}%</span>
                    )}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${line.stockCandidate ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  {line.stockCandidate ? t.suggested : t.notSuggested}
                </span>
              </div>

              {matchedBy && !received && (
                <p className="mt-2 text-xs text-slate-600">
                  {t.matchedBy}: <strong>{matchedBy}</strong>
                  {line.matchConfidence !== null ? ` · ${Math.round(line.matchConfidence * 100)}%` : ""}
                </p>
              )}

              {received ? (
                <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <div className="font-semibold">✓ {t.received}</div>
                  <div className="mt-1">
                    {line.matchedItem ? `${line.matchedItem.sku} · ${line.matchedItem.name}` : "—"}
                    {line.location ? ` · ${line.location.name}` : ""}
                  </div>
                  <div className="mt-1 text-xs">
                    {effectiveQuantity !== null ? `${inventoryFormatNumber(effectiveQuantity, language)} ${line.matchedItem?.baseUnit ?? line.unit ?? ""}` : ""}
                    {effectiveUnitCost !== null ? ` · ${t.unitCost}: ${inventoryFormatMoney(effectiveUnitCost, language)}` : ""}
                  </div>
                </div>
              ) : skipped ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div>
                    <span className="font-semibold">{t.skipped}</span>
                    {line.skipReason ? <span> · {line.skipReason}</span> : null}
                  </div>
                  {canEdit && (
                    <form action={reopenDocumentInventoryLine}>
                      <input type="hidden" name="lineId" value={line.id} />
                      <button type="submit" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100">
                        {t.reopen}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr_0.7fr_0.8fr_auto] lg:items-end">
                  <form action={receiveDocumentInventoryLine} className="contents">
                    <input type="hidden" name="lineId" value={line.id} />

                    <label className="min-w-0 text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">{t.item}</span>
                      <select
                        name="itemId"
                        required
                        disabled={!canEdit || duplicateBlocked || items.length === 0}
                        defaultValue={line.matchedItemId ?? ""}
                        className="w-full min-w-0 rounded border bg-white px-2 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">{t.chooseItem}</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.sku} · {item.name} · {item.baseUnit}{item.barcode ? ` · ${item.barcode}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="min-w-0 text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">{t.location}</span>
                      <select
                        name="locationId"
                        required
                        disabled={!canEdit || duplicateBlocked || locations.length === 0}
                        defaultValue={line.locationId ?? defaultLocationId}
                        className="w-full min-w-0 rounded border bg-white px-2 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">{t.chooseLocation}</option>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.code} · {location.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">{t.quantity}</span>
                      <input
                        name="quantity"
                        type="number"
                        step="0.001"
                        min="0.001"
                        required
                        disabled={!canEdit || duplicateBlocked}
                        defaultValue={line.quantity ?? 1}
                        className="w-full rounded border px-2 py-2 text-sm disabled:opacity-60"
                      />
                    </label>

                    <label className="text-xs font-semibold text-slate-700">
                      <span className="mb-1 block">{t.unitCost}</span>
                      <input
                        name="unitCost"
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={!canEdit || duplicateBlocked}
                        defaultValue={line.unitPrice ?? ""}
                        className="w-full rounded border px-2 py-2 text-sm disabled:opacity-60"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={!canEdit || duplicateBlocked || items.length === 0 || locations.length === 0}
                      className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.receive}
                    </button>
                  </form>

                  <form action={skipDocumentInventoryLine} className="lg:col-span-5 flex flex-wrap gap-2">
                    <input type="hidden" name="lineId" value={line.id} />
                    <input type="hidden" name="reason" value="Ekki lagerfærsla" />
                    <button
                      type="submit"
                      disabled={!canEdit}
                      className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {t.skip}
                    </button>
                  </form>

                  {items.length === 0 && <p className="lg:col-span-5 text-xs text-amber-700">{t.noInventoryItems}</p>}
                  {locations.length === 0 && <p className="lg:col-span-5 text-xs text-amber-700">{t.noLocations}</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
