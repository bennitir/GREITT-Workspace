import { formatDate, formatNumber } from "@/lib/locale";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";

function formatAuditDate(date: Date) {
  return date.toLocaleString("is-IS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function getSourceLabel(source: string) {
  switch (source) {
    case "USER":
      return "Notandi";

    case "AI":
      return "AI";

    case "IMPORT":
      return "Innflutningur";

    case "SYSTEM":
      return "Kerfi";

    default:
      return source;
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "BOOK_RECEIPT":
      return "Bókun fylgiskjals";

    case "REVIEW_RECEIPT":
      return "Yfirferð fylgiskjals";

    case "UPDATE_BOOKING_PROPOSAL":
      return "Bókunartillögu breytt";

    case "UPDATE_RECEIPT":
      return "Breyting fylgiskjals";

    case "DELETE_RECEIPT":
      return "Eyðing fylgiskjals";

    default:
      return action;
  }
}

function getBookingMethodLabel(method: unknown) {
  switch (method) {
    case "AI_DOCUMENT":
      return "Greint fylgiskjal";

    case "MANUAL_RECEIPT":
      return "Handvirk bókun";

    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}


function asBookingEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function formatAccountLabel(
  value: unknown,
  accountNames: Map<string, string>,
) {
  if (typeof value !== "string" || !value.trim()) {
    return "—";
  }

  const account = value.trim();
  const name = accountNames.get(account);

  return name ? `${account} – ${name}` : account;
}

export default async function BokudFylgiskjalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const voucherNumber = Number(id);

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);

  const moduleSettings = await getCompanyModuleSettings(companyId);

  const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
    (module) => module.id,
  );

  if (!enabledModuleIds.includes("bokhald")) {
    redirect("/");
  }

  if (!Number.isFinite(voucherNumber)) {
    notFound();
  }

  const aiDocument = await prisma.aiDetectedDocument.findFirst({
    where: {
      voucherNumber,
      receipt: {
        companyId,
      },
      approvedAt: {
        not: null,
      },
    },
    include: {
      receipt: true,
      bookingEntries: true,
    },
  });

  const importedReceipt = !aiDocument
    ? await prisma.receipt.findFirst({
        where: {
          companyId,
          voucherNumber,
          status: "APPROVED",
        },
        include: {
          entries: true,
        },
      })
    : null;

  if (!aiDocument && !importedReceipt) {
    notFound();
  }

  const document = aiDocument
    ? aiDocument
    : {
        id: importedReceipt!.id,
        voucherNumber: importedReceipt!.voucherNumber,
        date: importedReceipt!.date,
        merchantName:
          importedReceipt!.merchantName ?? importedReceipt!.description,
        merchantKennitala: importedReceipt!.merchantKennitala,
        totalAmount: importedReceipt!.amount,
        bookingEntries: importedReceipt!.entries,
        receipt: importedReceipt!,
      };

  const companyAccounts = await prisma.account.findMany({
    where: {
      companyId,
    },
    select: {
      number: true,
      name: true,
    },
  });

  const accountNames = new Map(
    companyAccounts.map((account) => [account.number, account.name]),
  );

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      companyId,
      entityType: "Receipt",
      entityId: document.receipt.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  const bookingAuditEvent = aiDocument
    ? auditEvents.find(
        (event) =>
          event.action === "BOOK_RECEIPT" &&
          event.parentEntityType === "AiDetectedDocument" &&
          event.parentEntityId === aiDocument.id,
      )
    : auditEvents.find((event) => event.action === "BOOK_RECEIPT");

  let originalFileUrl = document.receipt.filePath ?? null;

  if (document.receipt.storagePath) {
    const { data } = await supabaseAdmin.storage
      .from("fylgiskjol")
      .createSignedUrl(document.receipt.storagePath, 60 * 10);

    if (data?.signedUrl) {
      originalFileUrl = data.signedUrl;
    }
  }

  const totalDebit = document.bookingEntries.reduce(
    (sum, entry) => sum + entry.debit,
    0,
  );

  const totalCredit = document.bookingEntries.reduce(
    (sum, entry) => sum + entry.credit,
    0,
  );

  const balances = Math.abs(totalDebit - totalCredit) <= 0.01;

  return (
    <main className="p-8 text-lg">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Fylgiskjal {document.voucherNumber}
            </h1>

            <p className="mt-1 text-slate-600">
              {document.merchantName ?? "Óþekktur seljandi"}
            </p>

            {bookingAuditEvent ? (
              <p className="mt-2 text-sm text-slate-500">
                Bókað af{" "}
                <span className="font-medium text-slate-700">
                  {bookingAuditEvent.user?.name ??
                    bookingAuditEvent.user?.email ??
                    "Óþekktum notanda"}
                </span>{" "}
                · {formatAuditDate(bookingAuditEvent.createdAt)}
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            {document.receipt.filePath ? (
              <a
                href={originalFileUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-blue-600 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50"
              >
                Opna frumskjal
              </a>
            ) : (
              <span className="rounded border px-4 py-2 text-slate-500">
                Frumskjal fylgdi ekki innflutningi
              </span>
            )}

            <Link
              href="/fylgiskjol/bokud"
              className="rounded border px-4 py-2 hover:bg-slate-50"
            >
              Til baka í bókuð skjöl
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-[0.9fr_1.4fr] gap-6">
          <section className="rounded border p-5">
            <h2 className="text-xl font-bold">Fylgiskjal</h2>

            <div className="mt-4 grid grid-cols-[120px_1fr] gap-y-3">
              <strong>Dagsetning:</strong>

              <span>{document.date ? formatDate(document.date) : "—"}</span>

              <strong>Seljandi:</strong>
              <span>{document.merchantName ?? "—"}</span>

              <strong>Kennitala:</strong>
              <span>{document.merchantKennitala ?? "—"}</span>

              <strong>Upphæð:</strong>
              <span>{formatNumber(document.totalAmount ?? 0)} kr.</span>
            </div>
          </section>

          <section className="rounded border p-5">
            <h2 className="text-xl font-bold">Bókun</h2>

            <div className="mt-4 space-y-3">
              {document.bookingEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[60px_1fr_110px_110px] gap-4 border-b pb-2"
                >
                  <strong>{entry.account}</strong>

                  <span>{entry.text}</span>

                  <span className="text-right whitespace-nowrap">
                    Debet {formatNumber(entry.debit)} kr.
                  </span>

                  <span className="text-right whitespace-nowrap">
                    Kredit {formatNumber(entry.credit)} kr.
                  </span>
                </div>
              ))}

              <div className="mt-4 border-t pt-4">
                <div className="flex justify-between">
                  <strong>Debet samtals:</strong>
                  <strong>{formatNumber(totalDebit)} kr.</strong>
                </div>

                <div className="mt-1 flex justify-between">
                  <strong>Kredit samtals:</strong>
                  <strong>{formatNumber(totalCredit)} kr.</strong>
                </div>

                <div
                  className={`mt-3 font-semibold ${
                    balances ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {balances
                    ? "✓ Bókun stemmir"
                    : "⚠ Debet og kredit stemma ekki"}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">Rekjanleiki</h2>

              <p className="mt-1 text-sm text-slate-500">
                Saga bókunar og annarra rekjanlegra aðgerða á fylgiskjalinu.
              </p>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {auditEvents.length}{" "}
              {auditEvents.length === 1 ? "atburður" : "atburðir"}
            </span>
          </div>

          {auditEvents.length === 0 ? (
            <div className="mt-5 rounded border border-dashed bg-slate-50 p-4 text-sm text-slate-600">
              Rekjanleiki er ekki skráður fyrir þessa eldri bókun.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {auditEvents.map((event) => {
                const metadata = asRecord(event.metadata);
                const beforeData = asRecord(event.beforeData);
                const afterData = asRecord(event.afterData);

                const beforeBookingEntries = asBookingEntries(
                  beforeData?.bookingEntries,
                );
                const afterBookingEntries = asBookingEntries(
                  afterData?.bookingEntries,
                );

                const bookingEntryChanges =
                  event.action === "UPDATE_BOOKING_PROPOSAL"
                    ? afterBookingEntries.flatMap((afterEntry, index) => {
                        const entryId =
                          typeof afterEntry.id === "number"
                            ? afterEntry.id
                            : null;

                        const beforeEntry =
                          (entryId !== null
                            ? beforeBookingEntries.find(
                                (candidate) => candidate.id === entryId,
                              )
                            : null) ?? beforeBookingEntries[index];

                        if (!beforeEntry) {
                          return [];
                        }

                        const changes: Array<{
                          label: string;
                          before: string;
                          after: string;
                        }> = [];

                        if (beforeEntry.account !== afterEntry.account) {
                          changes.push({
                            label: "Reikningslykill",
                            before: formatAccountLabel(
                              beforeEntry.account,
                              accountNames,
                            ),
                            after: formatAccountLabel(
                              afterEntry.account,
                              accountNames,
                            ),
                          });
                        }

                        if (beforeEntry.text !== afterEntry.text) {
                          changes.push({
                            label: "Bókunartexti",
                            before:
                              typeof beforeEntry.text === "string"
                                ? beforeEntry.text
                                : "—",
                            after:
                              typeof afterEntry.text === "string"
                                ? afterEntry.text
                                : "—",
                          });
                        }

                        if (beforeEntry.debit !== afterEntry.debit) {
                          changes.push({
                            label: "Debet",
                            before:
                              typeof beforeEntry.debit === "number"
                                ? `${formatNumber(beforeEntry.debit)} kr.`
                                : "—",
                            after:
                              typeof afterEntry.debit === "number"
                                ? `${formatNumber(afterEntry.debit)} kr.`
                                : "—",
                          });
                        }

                        if (beforeEntry.credit !== afterEntry.credit) {
                          changes.push({
                            label: "Kredit",
                            before:
                              typeof beforeEntry.credit === "number"
                                ? `${formatNumber(beforeEntry.credit)} kr.`
                                : "—",
                            after:
                              typeof afterEntry.credit === "number"
                                ? `${formatNumber(afterEntry.credit)} kr.`
                                : "—",
                          });
                        }

                        return changes;
                      })
                    : [];

                const bookingMethod = getBookingMethodLabel(
                  metadata?.bookingMethod,
                );

                const eventVoucherNumber =
                  typeof metadata?.voucherNumber === "number"
                    ? metadata.voucherNumber
                    : typeof afterData?.voucherNumber === "number"
                      ? afterData.voucherNumber
                      : null;

                return (
                  <article
                    key={event.id}
                    className="rounded border bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {getActionLabel(event.action)}
                        </div>

                        {event.description ? (
                          <div className="mt-1 text-slate-700">
                            {event.description}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-right text-sm text-slate-500">
                        {formatAuditDate(event.createdAt)}
                      </div>
                    </div>

                    {bookingEntryChanges.length > 0 ? (
                      <div className="mt-4 rounded border border-slate-200 bg-white p-3">
                        <div className="text-sm font-semibold text-slate-800">
                          Breytingar
                        </div>

                        <div className="mt-2 space-y-3">
                          {bookingEntryChanges.map((change, index) => (
                            <div
                              key={`${change.label}-${index}`}
                              className="text-sm"
                            >
                              <div className="font-medium text-slate-700">
                                {change.label}
                              </div>

                              <div className="mt-1 grid gap-1 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3">
                                <span className="rounded bg-red-50 px-2 py-1 text-red-800">
                                  {change.before}
                                </span>
                                <span className="text-center text-slate-400">→</span>
                                <span className="rounded bg-green-50 px-2 py-1 text-green-800">
                                  {change.after}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-slate-500">Framkvæmt af: </span>

                        <span className="font-medium text-slate-800">
                          {event.user?.name ??
                            event.user?.email ??
                            "Kerfi / óþekktur notandi"}
                        </span>

                        {event.user?.name && event.user?.email ? (
                          <span className="text-slate-500">
                            {" "}
                            · {event.user.email}
                          </span>
                        ) : null}
                      </div>

                      <div>
                        <span className="text-slate-500">Uppruni: </span>

                        <span className="font-medium text-slate-800">
                          {getSourceLabel(event.source)}
                        </span>
                      </div>

                      {eventVoucherNumber !== null ? (
                        <div>
                          <span className="text-slate-500">
                            Fylgiskjalsnúmer:{" "}
                          </span>

                          <span className="font-medium text-slate-800">
                            {eventVoucherNumber}
                          </span>
                        </div>
                      ) : null}

                      {bookingMethod ? (
                        <div>
                          <span className="text-slate-500">
                            Bókunaraðferð:{" "}
                          </span>

                          <span className="font-medium text-slate-800">
                            {bookingMethod}
                          </span>
                        </div>
                      ) : null}

                      {event.parentEntityType === "AiDetectedDocument" &&
                      event.parentEntityId ? (
                        <div>
                          <span className="text-slate-500">
                            Greint skjal:{" "}
                          </span>

                          <span className="font-medium text-slate-800">
                            #{event.parentEntityId}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}