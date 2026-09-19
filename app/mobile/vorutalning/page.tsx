import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { getEffectiveUser } from "@/lib/core/access-control";
import { normalizeUiLanguage } from "@/lib/i18n/ui";
import { stocktakeMobileText } from "@/lib/i18n/stocktake-mobile";
import { work10UnitText } from "@/lib/i18n/work10";
import BarcodeCameraScanner from "./BarcodeCameraScanner";
import {
  cancelHandheldStocktake,
  recordHandheldCount,
  removeHandheldCountLine,
  startHandheldStocktake,
  submitHandheldStocktake,
} from "./actions";

type Props = {
  searchParams: Promise<{
    session?: string;
    k?: string;
    item?: string;
    saved?: string;
  }>;
};

function localeFor(language: string) {
  if (language === "en") return "en-GB";
  if (language === "pl") return "pl-PL";
  if (language === "sr") return "sr-RS";
  return "is-IS";
}

export default async function MobileStocktakePage({ searchParams }: Props) {
  const companyId = await requireCompanyModule("birgdir");
  const user = await getEffectiveUser();
  if (!user) return null;

  const params = await searchParams;
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { interfaceLanguage: true },
  });
  const language = normalizeUiLanguage(settings?.interfaceLanguage ?? "is");
  const t = stocktakeMobileText(language);
  const locale = localeFor(language);

  const locations = await prisma.inventoryLocation.findMany({
    where: { companyId, isActive: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, kind: true },
  });

  const requestedSessionId = Number(params.session ?? 0);
  const session = Number.isInteger(requestedSessionId) && requestedSessionId > 0
    ? await prisma.inventoryCountSession.findFirst({
        where: { id: requestedSessionId, companyId, createdById: user.id },
        include: {
          location: { select: { name: true, code: true } },
          lines: {
            where: { voidedAt: null, status: { not: "VOIDED" } },
            orderBy: [{ status: "asc" }, { countedAt: "desc" }],
          },
        },
      })
    : await prisma.inventoryCountSession.findFirst({
        where: { companyId, createdById: user.id, status: "COUNTING" },
        include: {
          location: { select: { name: true, code: true } },
          lines: {
            where: { voidedAt: null, status: { not: "VOIDED" } },
            orderBy: [{ status: "asc" }, { countedAt: "desc" }],
          },
        },
        orderBy: { createdAt: "desc" },
      });

  const query = String(params.k ?? "").trim();
  const requestedItemId = Number(params.item ?? 0);

  let selectedItem = Number.isInteger(requestedItemId) && requestedItemId > 0
    ? await prisma.inventoryItem.findFirst({
        where: {
          id: requestedItemId,
          companyId,
          isActive: true,
          isStockTracked: true,
        },
        select: {
          id: true,
          sku: true,
          barcode: true,
          name: true,
          baseUnit: true,
          customUnit: true,
        },
      })
    : null;

  let searchResults: Array<{
    id: number;
    sku: string;
    barcode: string | null;
    name: string;
    baseUnit: string;
    customUnit: string | null;
  }> = [];

  if (session?.status === "COUNTING" && query && !selectedItem) {
    const exact = await prisma.inventoryItem.findMany({
      where: {
        companyId,
        isActive: true,
        isStockTracked: true,
        OR: [
          { barcode: { equals: query, mode: "insensitive" } },
          { sku: { equals: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        baseUnit: true,
        customUnit: true,
      },
      take: 3,
    });

    if (exact.length === 1) {
      selectedItem = exact[0];
    } else {
      searchResults = exact.length > 0
        ? exact
        : await prisma.inventoryItem.findMany({
            where: {
              companyId,
              isActive: true,
              isStockTracked: true,
              OR: [
                { barcode: { contains: query, mode: "insensitive" } },
                { sku: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              sku: true,
              barcode: true,
              name: true,
              baseUnit: true,
              customUnit: true,
            },
            orderBy: { name: "asc" },
            take: 10,
          });
    }
  }

  const existingLine = selectedItem && session
    ? session.lines.find((line) => line.itemId === selectedItem?.id) ?? null
    : null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-100">
      <div className="mx-auto min-h-screen w-full max-w-md overflow-x-hidden bg-white px-4 pb-24 pt-5">
        <header>
          <Link
            href="/mobile"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm"
          >
            ← {t.backMobile}
          </Link>

          <p className="mt-5 text-sm font-bold tracking-wide text-slate-600">GLÖGGT MOBILE</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-950">{t.title}</h1>
          <p className="mt-2 text-base leading-6 text-slate-600">{t.subtitle}</p>
        </header>

        {!session ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">{t.chooseLocation}</h2>
            {locations.length === 0 ? (
              <p className="mt-3 text-sm text-amber-700">{t.noLocations}</p>
            ) : (
              <form action={startHandheldStocktake} className="mt-4 grid gap-4">
                <select
                  name="locationId"
                  required
                  className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base"
                >
                  <option value="">—</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} · {location.code}
                    </option>
                  ))}
                </select>
                <button className="min-h-12 rounded-xl bg-blue-600 px-4 font-bold text-white">
                  {t.startCount}
                </button>
              </form>
            )}
          </section>
        ) : (
          <>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.activeSession}</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{session.location.name}</p>
                  <p className="text-sm text-slate-500">{session.location.code}</p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700 shadow-sm">
                  {session.lines.length}
                </div>
              </div>
            </section>

            {session.status === "COUNTING" ? (
              <>
                {params.saved === "1" ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                    {t.saved}
                  </div>
                ) : null}

                <section className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <form method="get" className="grid min-w-0 gap-3">
                    <input type="hidden" name="session" value={session.id} />
                    <label className="grid gap-2 text-sm font-semibold text-slate-800">
                      <span>{t.scanBarcode}</span>
                      <input
                        name="k"
                        defaultValue={query}
                        autoFocus
                        autoComplete="off"
                        inputMode="text"
                        placeholder={t.scanPlaceholder}
                        className="min-h-14 w-full min-w-0 max-w-full rounded-xl border border-blue-300 bg-white px-4 text-lg font-semibold outline-none focus:border-blue-600"
                      />
                    </label>
                    <button className="min-h-12 rounded-xl bg-blue-600 px-4 font-bold text-white">
                      {t.search}
                    </button>
                  </form>
                  <BarcodeCameraScanner
                    sessionId={session.id}
                    labels={{
                      openCamera: t.openCamera,
                      closeCamera: t.closeCamera,
                      cameraHelp: t.cameraHelp,
                      cameraSearching: t.cameraSearching,
                      cameraUnsupported: t.cameraUnsupported,
                      cameraPermissionDenied: t.cameraPermissionDenied,
                      cameraUnavailable: t.cameraUnavailable,
                    }}
                  />
                  <p className="mt-3 text-xs leading-5 text-slate-600">{t.handheldHint}</p>
                </section>

                {searchResults.length > 0 ? (
                  <section className="mt-4 space-y-2">
                    <h2 className="text-base font-bold text-slate-900">{t.searchResults}</h2>
                    {searchResults.map((item) => (
                      <Link
                        key={item.id}
                        href={`/mobile/vorutalning?session=${session.id}&item=${item.id}`}
                        className="block min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-words font-bold text-slate-950">{item.name}</p>
                            <p className="mt-1 break-all text-sm text-slate-500">{item.sku}{item.barcode ? ` · ${item.barcode}` : ""}</p>
                          </div>
                          <span className="font-semibold text-blue-700">{t.chooseItem} →</span>
                        </div>
                      </Link>
                    ))}
                  </section>
                ) : query && !selectedItem ? (
                  <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t.noItem}</p>
                ) : null}

                {selectedItem ? (
                  <section className="mt-4 min-w-0 overflow-hidden rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
                    <p className="break-words text-xl font-bold text-slate-950">{selectedItem.name}</p>
                    <p className="mt-1 break-all text-sm text-slate-500">
                      {selectedItem.sku}{selectedItem.barcode ? ` · ${selectedItem.barcode}` : ""}
                    </p>
                    {existingLine?.status === "RECOUNT_REQUESTED" ? (
                      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                        {t.recountRequested}
                      </p>
                    ) : null}

                    <form action={recordHandheldCount} className="mt-5 grid w-full min-w-0 gap-4">
                      <input type="hidden" name="sessionId" value={session.id} />
                      <input type="hidden" name="itemId" value={selectedItem.id} />
                      <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-800">
                        <span>{t.countedQuantity} · {work10UnitText(selectedItem.baseUnit, selectedItem.customUnit, language)}</span>
                        <input
                          name="countedQuantity"
                          type="number"
                          min="0"
                          step="any"
                          required
                          autoFocus
                          defaultValue={existingLine ? String(existingLine.countedQuantity) : ""}
                          inputMode="decimal"
                          className="min-h-16 w-full min-w-0 max-w-full rounded-xl border-2 border-slate-300 px-4 text-3xl font-bold outline-none focus:border-blue-600"
                        />
                      </label>
                      <label className="grid min-w-0 gap-2 text-sm font-semibold text-slate-800">
                        <span>{t.note}</span>
                        <input
                          name="note"
                          defaultValue={existingLine?.note ?? ""}
                          className="min-h-12 w-full min-w-0 max-w-full rounded-xl border border-slate-300 px-3 text-base"
                        />
                      </label>
                      <button className="min-h-14 w-full min-w-0 max-w-full rounded-xl bg-emerald-600 px-4 text-lg font-bold text-white">
                        {t.saveCount}
                      </button>
                    </form>
                  </section>
                ) : null}

                {session.lines.length > 0 ? (
                  <section className="mt-6">
                    <h2 className="text-lg font-bold text-slate-950">{t.countedInSession}</h2>
                    <div className="mt-3 space-y-3">
                      {session.lines.map((line) => (
                        <div key={line.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-950">{line.nameSnapshot}</p>
                              <p className="mt-1 text-sm text-slate-500">{line.skuSnapshot}</p>
                              <p className="mt-2 text-xl font-bold text-slate-900">
                                {line.countedQuantity} {work10UnitText(line.unit, null, language)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {line.countedAt.toLocaleString(locale)}
                              </p>
                              {line.status === "RECOUNT_REQUESTED" ? (
                                <p className="mt-2 text-sm font-bold text-amber-700">{t.recountRequested}</p>
                              ) : null}
                            </div>
                            <Link
                              href={`/mobile/vorutalning?session=${session.id}&item=${line.itemId}`}
                              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-blue-700"
                            >
                              {t.chooseItem}
                            </Link>
                          </div>
                          {line.status !== "RECOUNT_REQUESTED" ? (
                            <form action={removeHandheldCountLine} className="mt-3">
                              <input type="hidden" name="sessionId" value={session.id} />
                              <input type="hidden" name="lineId" value={line.id} />
                              <button className="text-sm font-semibold text-red-700">{t.remove}</button>
                            </form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="mt-6 grid gap-3">
                  <form action={submitHandheldStocktake}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button className="min-h-14 w-full rounded-xl bg-slate-950 px-4 text-lg font-bold text-white">
                      {t.submitForReview}
                    </button>
                  </form>
                  <form action={cancelHandheldStocktake}>
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 font-semibold text-slate-700">
                      {t.cancelSession}
                    </button>
                  </form>
                </section>
              </>
            ) : (
              <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="font-semibold text-slate-800">
                  {session.status === "REVIEW"
                    ? t.reviewPending
                    : session.status === "COMPLETED"
                      ? t.completed
                      : t.cancelled}
                </p>
                <Link
                  href="/mobile/vorutalning"
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 font-bold text-white"
                >
                  {t.startCount}
                </Link>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
