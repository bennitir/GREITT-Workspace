import Link from "next/link";
import { redirect } from "next/navigation";
import { defaultAccounts } from "@/app/data/accounts";
import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";
import { updateAccountVatSettings } from "@/app/actions/companyActions";
import VatSettingsFields from "./VatSettingsFields";

type Props = {
  params: Promise<{
    id: string;
    accountId: string;
  }>;
};

const VAT_AUDIT_FIELDS = [
  "vatTreatment",
  "vatRate",
  "vatAccount",
  "vatCode",
  "vatDeductiblePercent",
  "vatRequiresConfirmation",
] as const;

const VAT_AUDIT_FIELD_LABELS: Record<
  (typeof VAT_AUDIT_FIELDS)[number],
  string
> = {
  vatTreatment: "VSK-meðferð",
  vatRate: "VSK %",
  vatAccount: "VSK-reikningur",
  vatCode: "VSK-kóði",
  vatDeductiblePercent: "Frádráttur",
  vatRequiresConfirmation: "Staðfesting",
};

function numberOrNull(
  value: FormDataEntryValue | null
) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const number = Number(text);

  if (!Number.isInteger(number)) {
    throw new Error(
      "Gildið verður að vera heil tala."
    );
  }

  return number;
}

function textOrNull(
  value: FormDataEntryValue | null
) {
  const text = String(value ?? "").trim();

  return text || null;
}

function auditObject(
  value: unknown
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function vatTreatmentLabel(
  value: unknown
) {
  switch (value) {
    case "INPUT":
      return "Innskattur";
    case "OUTPUT":
      return "Útskattur";
    case "EXEMPT":
      return "Undanþegið";
    case "NONE":
      return "Engin VSK-meðferð";
    case "REVIEW":
      return "Þarf yfirferð";
    case "SYSTEM":
      return "VSK kerfisreikningur";
    case null:
    case undefined:
    case "":
      return "Ekki skilgreint";
    default:
      return String(value);
  }
}

function formatAuditValue(
  field: (typeof VAT_AUDIT_FIELDS)[number],
  value: unknown
) {
  if (field === "vatTreatment") {
    return vatTreatmentLabel(value);
  }

  if (field === "vatRequiresConfirmation") {
    if (value === true) {
      return "Krafist";
    }

    if (value === false) {
      return "Ekki krafist";
    }

    return "Ekki skilgreint";
  }

  if (field === "vatDeductiblePercent") {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return `${value}%`;
    }

    return "Ekki skilgreint";
  }

  if (field === "vatRate") {
    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return `${value}%`;
    }

    return "Ekki skilgreint";
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Ekki skilgreint";
  }

  return String(value);
}

function getVatAuditChanges(
  beforeData: unknown,
  afterData: unknown
) {
  const before = auditObject(beforeData);
  const after = auditObject(afterData);

  if (!before && !after) {
    return [];
  }

  return VAT_AUDIT_FIELDS.flatMap(
    (field) => {
      const beforeValue = before?.[field];
      const afterValue = after?.[field];

      if (
        JSON.stringify(beforeValue) ===
        JSON.stringify(afterValue)
      ) {
        return [];
      }

      return [
        {
          field,
          label:
            VAT_AUDIT_FIELD_LABELS[field],
          before: formatAuditValue(
            field,
            beforeValue
          ),
          after: formatAuditValue(
            field,
            afterValue
          ),
        },
      ];
    }
  );
}

function auditSourceLabel(
  source: string
) {
  switch (source) {
    case "USER":
      return "Notandi";
    case "AI":
      return "GLÖGGT / AI";
    case "SYSTEM":
      return "Kerfi";
    default:
      return source;
  }
}

function formatAuditDate(
  date: Date
) {
  return date.toLocaleString("is-IS", {
    timeZone: "Atlantic/Reykjavik",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function auditUserLabel(
  user: {
    name: string | null;
    email: string | null;
  } | null,
  userId: number | null
) {
  const name = user?.name?.trim();
  const email = user?.email?.trim();

  if (name && email) {
    return `${name} · ${email}`;
  }

  if (name) {
    return name;
  }

  if (email) {
    return email;
  }

  if (userId !== null) {
    return `Notandi #${userId}`;
  }

  return "Kerfi";
}

export default async function ReikningslykillEditPage({
  params,
}: Props) {
  const {
    id,
    accountId: accountIdParam,
  } = await params;

  const companyId = Number(id);
  const accountId = Number(accountIdParam);

  if (
    !Number.isInteger(companyId) ||
    !Number.isInteger(accountId)
  ) {
    redirect("/fyrirtaeki");
  }

  const activeUser =
    await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  if (activeUser.role !== "ADMIN") {
    const access =
      await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId: activeUser.id,
            companyId,
          },
        },
      });

    if (!access || !access.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const company =
    await prisma.company.findUnique({
      where: {
        id: companyId,
      },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const account =
    await prisma.account.findFirst({
      where: {
        id: accountId,
        companyId,
      },
    });

  if (!account) {
    redirect(
      `/fyrirtaeki/${companyId}/reikningslyklar`
    );
  }

  const defaultAccount =
    defaultAccounts.find(
      (item) =>
        item.number === account.number &&
        item.name
          .trim()
          .toLowerCase() ===
          account.name
            .trim()
            .toLowerCase()
    );

  const auditEvents =
    await prisma.auditEvent.findMany({
      where: {
        companyId,
        entityType: "Account",
        entityId: account.id,
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

  return (
    <main className="p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">
              Breyta VSK-meðferð
            </h1>

            <p className="mt-1 text-slate-600">
              {company.name}
            </p>
          </div>

          <Link
            href={`/fyrirtaeki/${company.id}/reikningslyklar`}
            className="rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-50"
          >
            Til baka í reikningslykla
          </Link>
        </div>

        <div className="mb-6 rounded-lg border bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">
            Reikningslykill
          </p>

          <p className="mt-1 text-xl font-semibold">
            {account.number} ·{" "}
            {account.name}
          </p>

          <p className="mt-3 text-sm text-slate-600">
            Hér er aðeins verið að stilla
            VSK-meðferð þessa reiknings.
            Heiti, númer og önnur
            bókhaldsuppsetning breytist ekki.
          </p>
        </div>

        {!company.isActive && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
            Fyrirtækið er lokað. Ekki er
            hægt að vista nýjar stillingar.
          </div>
        )}

        {defaultAccount && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-blue-900">
                  GLÖGGT tillaga
                </h2>

                <p className="mt-1 text-sm text-blue-800">
                  Tillagan byggir á GLÖGGT
                  grunnreikningslyklinum.
                  Hún vistast ekki nema bókari
                  velji og staðfesti meðferðina.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-sm text-slate-500">
                  VSK-meðferð
                </span>

                <p className="font-medium">
                  {defaultAccount.vatTreatment ===
                  "INPUT"
                    ? "Innskattur"
                    : defaultAccount.vatTreatment ===
                        "OUTPUT"
                      ? "Útskattur"
                      : defaultAccount.vatTreatment ===
                          "EXEMPT"
                        ? "Undanþegið"
                        : defaultAccount.vatTreatment ===
                            "NONE"
                          ? "Engin VSK-meðferð"
                          : defaultAccount.vatTreatment ===
                              "REVIEW"
                            ? "Þarf yfirferð"
                            : defaultAccount.vatTreatment ===
                                "SYSTEM"
                              ? "VSK kerfisreikningur"
                              : "Ekki skilgreint"}
                </p>
              </div>

              <div>
                <span className="text-sm text-slate-500">
                  VSK %
                </span>

                <p className="font-medium">
                  {defaultAccount.vatRate ??
                    "—"}
                </p>
              </div>

              <div>
                <span className="text-sm text-slate-500">
                  Frádráttur
                </span>

                <p className="font-medium">
                  {defaultAccount.vatDeductiblePercent !=
                  null
                    ? `${defaultAccount.vatDeductiblePercent}%`
                    : "Ekki ákveðið sjálfkrafa"}
                </p>
              </div>

              <div>
                <span className="text-sm text-slate-500">
                  Staðfesting
                </span>

                <p className="font-medium">
                  {defaultAccount.vatRequiresConfirmation
                    ? "Krafist"
                    : "Ekki krafist"}
                </p>
              </div>
            </div>
          </div>
        )}

        <form
          action={async (formData) => {
            "use server";

            const vatTreatmentValue =
              textOrNull(
                formData.get(
                  "vatTreatment"
                )
              );

            const allowedTreatments = [
              "OUTPUT",
              "INPUT",
              "EXEMPT",
              "NONE",
              "REVIEW",
              "SYSTEM",
            ];

            if (
              vatTreatmentValue !== null &&
              !allowedTreatments.includes(
                vatTreatmentValue
              )
            ) {
              throw new Error(
                "Ógild VSK-meðferð."
              );
            }

            const submittedVatRate =
              numberOrNull(
                formData.get("vatRate")
              );

            const vatRate =
              vatTreatmentValue ===
                "INPUT" ||
              vatTreatmentValue ===
                "OUTPUT" ||
              vatTreatmentValue ===
                "REVIEW"
                ? submittedVatRate
                : null;

            await updateAccountVatSettings(
              companyId,
              accountId,
              {
                vatRate,

                vatAccount:
                  vatTreatmentValue ===
                  "INPUT"
                    ? "2520"
                    : vatTreatmentValue ===
                        "OUTPUT"
                      ? "2510"
                      : vatTreatmentValue ===
                          "REVIEW"
                        ? account.vatAccount ??
                          null
                        : null,

                vatCode:
                  vatTreatmentValue ===
                    "INPUT" &&
                  vatRate !== null
                    ? `INPUT_${vatRate}`
                    : vatTreatmentValue ===
                          "OUTPUT" &&
                        vatRate !== null
                      ? `OUTPUT_${vatRate}`
                      : vatTreatmentValue ===
                          "EXEMPT"
                        ? "EXEMPT"
                        : vatTreatmentValue ===
                            "NONE"
                          ? "NO_VAT"
                          : vatTreatmentValue ===
                              "SYSTEM"
                            ? "SYSTEM"
                            : vatTreatmentValue ===
                                "REVIEW"
                              ? "REVIEW"
                              : null,

                vatTreatment:
                  vatTreatmentValue as
                    | "OUTPUT"
                    | "INPUT"
                    | "EXEMPT"
                    | "NONE"
                    | "REVIEW"
                    | "SYSTEM"
                    | null,

                vatDeductiblePercent:
                  numberOrNull(
                    formData.get(
                      "vatDeductiblePercent"
                    )
                  ),

                vatRequiresConfirmation:
                  vatTreatmentValue ===
                    "REVIEW" ||
                  formData.get(
                    "vatRequiresConfirmation"
                  ) === "on",
              }
            );

            redirect(
              `/fyrirtaeki/${companyId}/reikningslyklar`
            );
          }}
          className="space-y-6 rounded-lg border bg-white p-6 shadow-sm"
        >
          <VatSettingsFields
            disabled={!company.isActive}
            current={{
              vatTreatment:
                (account.vatTreatment as
                  | "OUTPUT"
                  | "INPUT"
                  | "EXEMPT"
                  | "NONE"
                  | "REVIEW"
                  | "SYSTEM"
                  | null) ?? "",
              vatRate: account.vatRate,
              vatDeductiblePercent:
                account.vatDeductiblePercent,
              vatRequiresConfirmation:
                account.vatRequiresConfirmation,
            }}
            suggestion={
              defaultAccount
                ? {
                    vatTreatment:
                      (defaultAccount.vatTreatment as
                        | "OUTPUT"
                        | "INPUT"
                        | "EXEMPT"
                        | "NONE"
                        | "REVIEW"
                        | "SYSTEM"
                        | undefined) ??
                      "",
                    vatRate:
                      defaultAccount.vatRate ??
                      null,
                    vatDeductiblePercent:
                      defaultAccount.vatDeductiblePercent ??
                      null,
                    vatRequiresConfirmation:
                      defaultAccount.vatRequiresConfirmation ??
                      false,
                  }
                : null
            }
          />

          {company.isActive && (
            <div className="flex flex-wrap gap-3 border-t pt-5">
              <button
                type="submit"
                className="rounded bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700"
              >
                Vista VSK-stillingar
              </button>

              <Link
                href={`/fyrirtaeki/${company.id}/reikningslyklar`}
                className="rounded border border-slate-300 bg-white px-5 py-2 font-medium text-slate-800 hover:bg-slate-50"
              >
                Hætta við
              </Link>
            </div>
          )}
        </form>

        <section className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Rekjanleiki
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Saga breytinga á þessum
                reikningslykli.
              </p>
            </div>

            <div className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {auditEvents.length}{" "}
              {auditEvents.length === 1
                ? "atburður"
                : "atburðir"}
            </div>
          </div>

          {auditEvents.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              Engin breytingasaga hefur verið
              skráð fyrir þennan reikningslykil.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {auditEvents.map((event) => {
                const changes =
                  getVatAuditChanges(
                    event.beforeData,
                    event.afterData
                  );

                return (
                  <article
                    key={event.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          {event.description ??
                            event.action}
                        </p>

                        <p className="mt-1 text-sm text-slate-600">
                          {auditUserLabel(
                            event.user,
                            event.userId
                          )}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-700">
                          {formatAuditDate(
                            event.createdAt
                          )}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Uppruni:{" "}
                          {auditSourceLabel(
                            event.source
                          )}
                        </p>
                      </div>
                    </div>

                    {changes.length > 0 && (
                      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                        {changes.map(
                          (
                            change,
                            index
                          ) => (
                            <div
                              key={
                                change.field
                              }
                              className={`grid gap-2 px-4 py-3 text-sm sm:grid-cols-[150px_1fr] ${
                                index > 0
                                  ? "border-t border-slate-200"
                                  : ""
                              }`}
                            >
                              <div className="font-medium text-slate-700">
                                {
                                  change.label
                                }
                              </div>

                              <div className="text-slate-700">
                                <span className="text-slate-500">
                                  {
                                    change.before
                                  }
                                </span>

                                <span className="mx-2 text-slate-400">
                                  →
                                </span>

                                <span className="font-medium text-slate-900">
                                  {
                                    change.after
                                  }
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    )}

                    {changes.length === 0 && (
                      <p className="mt-3 text-sm text-slate-500">
                        Engar sundurliðaðar
                        breytingar eru skráðar með
                        þessum atburði.
                      </p>
                    )}
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