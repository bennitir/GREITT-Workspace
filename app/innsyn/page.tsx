import { getEffectiveUser } from "@/lib/core/access-control";
import { formatNumber } from "@/lib/locale";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function formatKr(amount: number) {
  return `${formatNumber(amount, {
    maximumFractionDigits: 0,
  })} kr.`;
}

function formatDate(date: Date | null) {
  if (!date) return "—";

  return date.toLocaleDateString("is-IS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function humanizeCode(value: string | null | undefined) {
  if (!value) return "";

  const translations: Record<string, string> = {
    PERSON: "Einstaklingur",
    ORGANIZATION: "Fyrirtæki / stofnun",
    COMPANY: "Fyrirtæki",
    VEHICLE: "Ökutæki",
    PROPERTY: "Fasteign",
    LOAN: "Lán",
    CONTRACT: "Samningur",
    ACCOUNT: "Reikningur",
    INVOICE: "Reikningur",
    OFFER: "Tilboð",
    INSURANCE_OFFER: "Tryggingatilboð",
    INSURANCE: "Trygging",
    INSURANCE_POLICY: "Tryggingarskírteini",
    POLICY: "Tryggingarskírteini",
    INSURER: "Tryggingafélag",

    ACTIVE: "Virkt",
    OPEN: "Opið",
    CLOSED: "Lokað",
    PENDING: "Bíður",
    PROCESSING: "Í vinnslu",
    COMPLETED: "Lokið",
    COMPLETED_WITH_ERRORS: "Lokið með villum",
    FAILED: "Mistókst",
    CANCELLED: "Hætt við",
    NEEDS_REPROCESS: "Þarf endurvinnslu",

    CONFIRMED: "Staðfest",
    UNCONFIRMED: "Óstaðfest",
    PROPOSED: "Tillaga",
    REJECTED: "Hafnað",

    PRIMARY: "Aðalskjal",
    SUPPORTING: "Stuðningsskjal",
    PAYMENT: "Greiðsla",
    SETTLEMENT: "Uppgjör",
    CORRECTION: "Leiðrétting",

    PREMIUM: "Iðgjald",
    FEE: "Gjald",
    COVERAGE: "Tryggingarfjárhæð",
    DEDUCTIBLE: "Eigin áhætta",
    OTHER: "Önnur upplýsing",

    CHARGE: "Krafa",
    CREDIT: "Kredit",
    LOAN_INSTALLMENT: "Afborgun láns",
    ANNUAL_ASSESSMENT: "Ársálagning",

    USER: "Notandi",
    SYSTEM: "Kerfi",
    AI: "AI",
    UPLOAD: "Innlestur",
  };

  if (translations[value]) {
    return translations[value];
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) =>
      part.length > 0
        ? part.charAt(0).toUpperCase() + part.slice(1)
        : part
    )
    .join(" ");
}

function formatFactValue(fact: {
  numberValue: unknown;
  textValue: string | null;
  dateValue: Date | null;
  booleanValue: boolean | null;
  unit: string | null;
  currency: string | null;
}) {
  if (fact.numberValue !== null) {
    const value = Number(fact.numberValue);

    if (fact.currency === "ISK") {
      return formatKr(value);
    }

    const formatted = formatNumber(value, {
      maximumFractionDigits: 2,
    });

    if (fact.unit) {
      return `${formatted} ${fact.unit}`;
    }

    if (fact.currency) {
      return `${formatted} ${fact.currency}`;
    }

    return formatted;
  }

  if (fact.textValue) {
    return fact.textValue;
  }

  if (fact.dateValue) {
    return formatDate(fact.dateValue);
  }

  if (fact.booleanValue !== null) {
    return fact.booleanValue ? "Já" : "Nei";
  }

  return "—";
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("is-IS")
    .replaceAll("ý", "y")
    .replaceAll("í", "i")
    .replaceAll("á", "a")
    .replaceAll("é", "e")
    .replaceAll("ó", "o")
    .replaceAll("ú", "u")
    .replaceAll("ö", "o")
    .replaceAll("ð", "d")
    .replaceAll("þ", "th");
}

function documentKey(
  receiptId: number | null,
  documentId: number | null
) {
  return `${receiptId ?? "none"}:${documentId ?? "receipt"}`;
}

function isInsuranceFact(fact: {
  factType: string;
  label: string | null;
}) {
  const type = fact.factType.toUpperCase();
  const label = normalizeText(fact.label);

  if (
    type === "PREMIUM" ||
    type === "FEE" ||
    type === "COVERAGE" ||
    type === "DEDUCTIBLE"
  ) {
    return true;
  }

  return (
    label.includes("trygg") ||
    label.includes("idgjald") ||
    label.includes("kasko") ||
    label.includes("eigin ahætta") ||
    label.includes("eigin ahaetta") ||
    label.includes("brunatrygg") ||
    label.includes("innbutrygg")
  );
}

function isTotalPremiumFact(fact: {
  factType: string;
  label: string | null;
  numberValue: unknown;
}) {
  if (fact.numberValue === null) {
    return false;
  }

  const type = fact.factType
    .trim()
    .toUpperCase()
    .replace(/[\\s-]+/g, "_");

  const label = normalizeText(fact.label);

  const explicitTypes = new Set([
    "TOTAL_PREMIUM",
    "ANNUAL_PREMIUM_TOTAL",
    "TOTAL_ANNUAL_PREMIUM",
    "PREMIUM_TOTAL",
  ]);

  if (explicitTypes.has(type)) {
    return true;
  }

  const saysPremium =
    label.includes("idgjald") ||
    label.includes("idgjold");

  const saysTotal =
    label.includes("samtals") ||
    label.includes("heild");

  const saysAnnual =
    label.includes("ars") ||
    label.includes("a ari");

  return saysPremium && saysTotal && saysAnnual;
}

function isQuotedPremiumFact(fact: {
  factType: string;
  label: string | null;
  numberValue: unknown;
}) {
  if (fact.numberValue === null) {
    return false;
  }

  const type = fact.factType
    .trim()
    .toUpperCase()
    .replace(/[\\s-]+/g, "_");

  const label = normalizeText(fact.label);

  const explicitTypes = new Set([
    "QUOTED_PREMIUM",
    "OFFER_PREMIUM",
    "GROSS_PREMIUM",
    "PREMIUM_BEFORE_REFUND",
  ]);

  if (explicitTypes.has(type)) {
    return true;
  }

  const saysPremium =
    label.includes("idgjald") ||
    label.includes("idgjold");

  const saysTotal =
    label.includes("samtals") ||
    label.includes("heild");

  const saysConditional =
    label.includes("tjonlaus") ||
    label.includes("endurgreidsla") ||
    label.includes("stofnendurgreidsla");

  return saysPremium && saysTotal && !saysConditional;
}

function isPossibleRefundFact(fact: {
  factType: string;
  label: string | null;
  numberValue: unknown;
}) {
  if (fact.numberValue === null) {
    return false;
  }

  const type = fact.factType
    .trim()
    .toUpperCase()
    .replace(/[\\s-]+/g, "_");

  const label = normalizeText(fact.label);

  return (
    type.includes("REFUND") ||
    label.includes("endurgreidsla") ||
    label.includes("stofnendurgreidsla")
  );
}

export default async function InnsynPage() {
  const cookieStore = await cookies();
  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold">
          Innsýn
        </h1>

        <p className="mt-4 text-lg text-slate-600">
          Ekkert fyrirtæki er virkt.
        </p>
      </div>
    );
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
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

  const [
    company,
    accounts,
    receipts,
    entities,
    facts,
    financialEvents,
    processingJobs,
    entityCount,
    factCount,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: {
        id: companyId,
      },
      select: {
        name: true,
      },
    }),

    prisma.account.findMany({
      where: {
        companyId,
        isActive: true,
      },
      select: {
        number: true,
        entryRole: true,
        type: true,
      },
    }),

    prisma.receipt.findMany({
      where: {
        companyId,
      },
      select: {
        entries: {
          select: {
            account: true,
            debit: true,
            credit: true,
          },
        },
      },
    }),

    prisma.insightEntity.findMany({
      where: {
        companyId,
        status: "ACTIVE",
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: 50,
      select: {
        id: true,
        entityType: true,
        name: true,
        identifierType: true,
        identifierValue: true,
        relationshipStatus: true,
        relationshipType: true,
        relationshipNote: true,
        updatedAt: true,

        documentLinks: {
          select: {
            receiptId: true,
            documentId: true,
            role: true,
          },
        },

        facts: {
          orderBy: {
            createdAt: "desc",
          },
          take: 5,
          select: {
            id: true,
            factType: true,
            label: true,
            numberValue: true,
            textValue: true,
            dateValue: true,
            booleanValue: true,
            unit: true,
            currency: true,
            confidence: true,
            source: true,
          },
        },
      },
    }),

    prisma.insightFact.findMany({
      where: {
        companyId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 250,
      select: {
        id: true,
        receiptId: true,
        documentId: true,
        entityId: true,
        eventId: true,
        factType: true,
        label: true,
        numberValue: true,
        textValue: true,
        dateValue: true,
        booleanValue: true,
        unit: true,
        currency: true,
        confidence: true,
        source: true,
        createdAt: true,
      },
    }),

    prisma.financialEvent.findMany({
      where: {
        companyId,
      },
      orderBy: [
        {
          eventDate: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 20,
      select: {
        id: true,
        eventType: true,
        status: true,
        title: true,
        eventDate: true,
        amount: true,
        currency: true,
        externalReference: true,
      },
    }),

    prisma.insightProcessingJob.findMany({
      where: {
        companyId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      select: {
        id: true,
        jobType: true,
        status: true,
        totalItems: true,
        pendingItems: true,
        processingItems: true,
        completedItems: true,
        failedItems: true,
        createdAt: true,
      },
    }),

    prisma.insightEntity.count({
      where: {
        companyId,
        status: "ACTIVE",
      },
    }),

    prisma.insightFact.count({
      where: {
        companyId,
      },
    }),
  ]);

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const revenueAccounts = new Set(
    accounts
      .filter(
        (account) =>
          account.entryRole === "REVENUE"
      )
      .map((account) => account.number)
  );

  const expenseAccounts = new Set(
    accounts
      .filter(
        (account) =>
          account.entryRole === "EXPENSE"
      )
      .map((account) => account.number)
  );

  const vatOutputAccounts = new Set(
    accounts
      .filter(
        (account) =>
          account.type === "VAT_OUTPUT"
      )
      .map((account) => account.number)
  );

  const vatInputAccounts = new Set(
    accounts
      .filter(
        (account) =>
          account.type === "VAT_INPUT"
      )
      .map((account) => account.number)
  );

  let revenue = 0;
  let expenses = 0;
  let outputVat = 0;
  let inputVat = 0;

  for (const receipt of receipts) {
    for (const entry of receipt.entries) {
      if (
        revenueAccounts.has(entry.account)
      ) {
        revenue +=
          entry.credit - entry.debit;
      }

      if (
        expenseAccounts.has(entry.account)
      ) {
        expenses +=
          entry.debit - entry.credit;
      }

      if (
        vatOutputAccounts.has(entry.account)
      ) {
        outputVat +=
          entry.credit - entry.debit;
      }

      if (
        vatInputAccounts.has(entry.account)
      ) {
        inputVat +=
          entry.debit - entry.credit;
      }
    }
  }

  const result = revenue - expenses;
  const vatBalance =
    outputVat - inputVat;

  const totalKnowledgeItems =
    entityCount + factCount;

  const activeProcessingJobs =
    processingJobs.filter(
      (job) =>
        job.status === "PENDING" ||
        job.status === "PROCESSING"
    ).length;

  const entitiesByType = new Map<
    string,
    number
  >();

  for (const entity of entities) {
    entitiesByType.set(
      entity.entityType,
      (entitiesByType.get(
        entity.entityType
      ) ?? 0) + 1
    );
  }

  const detectedAreas = Array.from(
    entitiesByType.entries()
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const importantFacts = facts
    .filter((fact) => {
      if (fact.numberValue !== null) {
        return true;
      }

      if (fact.dateValue !== null) {
        return true;
      }

      if (
        fact.textValue &&
        fact.textValue.length <= 120
      ) {
        return true;
      }

      return false;
    })
    .slice(0, 8);

  // ==========================================================
  // TRYGGINGAR – FYRSTA ALVÖRU INNSÝN-SAGAN
  //
  // Staðreyndir eru flokkaðar eftir upprunaskjali.
  // Þannig blandast t.d. eldra tryggingarskírteini
  // ekki saman við nýrra tryggingatilboð.
  // ==========================================================

  const insuranceGroups = new Map<
    string,
    {
      receiptId: number | null;
      documentId: number | null;
      latestCreatedAt: Date;
      facts: typeof facts;
    }
  >();

  for (const fact of facts) {
    if (!isInsuranceFact(fact)) {
      continue;
    }

    if (
      fact.receiptId === null &&
      fact.documentId === null
    ) {
      continue;
    }

    const key = documentKey(
      fact.receiptId,
      fact.documentId
    );

    const current =
      insuranceGroups.get(key);

    if (!current) {
      insuranceGroups.set(key, {
        receiptId: fact.receiptId,
        documentId: fact.documentId,
        latestCreatedAt:
          fact.createdAt,
        facts: [fact],
      });

      continue;
    }

    current.facts.push(fact);

    if (
      fact.createdAt >
      current.latestCreatedAt
    ) {
      current.latestCreatedAt =
        fact.createdAt;
    }
  }

  const insuranceDocuments =
    Array.from(
      insuranceGroups.values()
    ).sort(
      (a, b) =>
        b.latestCreatedAt.getTime() -
        a.latestCreatedAt.getTime()
    );

  const latestInsurance =
    insuranceDocuments[0] ?? null;

  const latestInsuranceKey =
    latestInsurance
      ? documentKey(
          latestInsurance.receiptId,
          latestInsurance.documentId
        )
      : null;

  const latestInsuranceEntities =
    latestInsuranceKey
      ? entities.filter((entity) =>
          entity.documentLinks.some(
            (link) =>
              documentKey(
                link.receiptId,
                link.documentId
              ) === latestInsuranceKey
          )
        )
      : [];

  const insuranceVehicles =
    latestInsuranceEntities.filter(
      (entity) =>
        entity.entityType.toUpperCase() ===
        "VEHICLE"
    );

  const insuranceProperties =
    latestInsuranceEntities.filter(
      (entity) =>
        entity.entityType
          .toUpperCase()
          .includes("PROPERTY")
    );

  const insuranceItems =
    latestInsuranceEntities.filter(
      (entity) => {
        const type =
          entity.entityType.toUpperCase();

        return (
          type.includes("INSURANCE") ||
          type === "POLICY" ||
          type === "OFFER"
        );
      }
    );

  let quotedAnnualPremium:
    | number
    | null = null;

  let conditionalAnnualPremium:
    | number
    | null = null;

  let possibleRefund:
    | number
    | null = null;

  if (latestInsurance) {
    const quotedPremiumFact =
      latestInsurance.facts.find(
        isQuotedPremiumFact
      );

    const conditionalPremiumFact =
      latestInsurance.facts.find(
        isTotalPremiumFact
      );

    const refundFact =
      latestInsurance.facts.find(
        isPossibleRefundFact
      );

    if (
      quotedPremiumFact?.numberValue !==
        null &&
      quotedPremiumFact?.numberValue !==
        undefined
    ) {
      quotedAnnualPremium = Number(
        quotedPremiumFact.numberValue
      );
    }

    if (
      conditionalPremiumFact?.numberValue !==
        null &&
      conditionalPremiumFact?.numberValue !==
        undefined
    ) {
      conditionalAnnualPremium = Number(
        conditionalPremiumFact.numberValue
      );
    }

    if (
      refundFact?.numberValue !== null &&
      refundFact?.numberValue !== undefined
    ) {
      possibleRefund = Math.abs(
        Number(refundFact.numberValue)
      );
    }
  }

  const coverageFacts =
    latestInsurance?.facts.filter(
      (fact) =>
        fact.factType.toUpperCase() ===
          "COVERAGE" &&
        fact.numberValue !== null
    ) ?? [];

  const highestCoverage =
    coverageFacts.length > 0
      ? Math.max(
          ...coverageFacts.map((fact) =>
            Number(fact.numberValue)
          )
        )
      : null;

  const deductibleFacts =
    latestInsurance?.facts.filter(
      (fact) =>
        fact.factType.toUpperCase() ===
          "DEDUCTIBLE" &&
        fact.numberValue !== null
    ) ?? [];

  const lowestDeductible =
    deductibleFacts.length > 0
      ? Math.min(
          ...deductibleFacts.map(
            (fact) =>
              Number(fact.numberValue)
          )
        )
      : null;

  const highestDeductible =
    deductibleFacts.length > 0
      ? Math.max(
          ...deductibleFacts.map(
            (fact) =>
              Number(fact.numberValue)
          )
        )
      : null;

  const hasInsightData =
    entityCount > 0 ||
    factCount > 0 ||
    financialEvents.length > 0;

  return (
    <div className="p-6 md:p-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          GLÖGGT Innsýn
        </p>

        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {company.name}
        </h1>

        <p className="mt-2 max-w-3xl text-slate-600">
          Reksturinn í tölum og sú þekking
          sem GLÖGGT hefur byggt upp úr
          skjölum fyrirtækisins.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Tekjur
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatKr(revenue)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Gjöld
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatKr(expenses)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Rekstrarniðurstaða
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatKr(result)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-medium text-slate-500">
            Þekkingaratriði
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {totalKnowledgeItems}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {entityCount} fyrirbæri ·{" "}
            {factCount} staðreyndir
          </p>
        </div>
      </div>

      {latestInsurance && (
        <section className="mt-8 overflow-hidden rounded-xl border bg-white">
          <div className="border-b bg-slate-50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Innsýn úr skjölum
                </p>

                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  Tryggingar
                </h2>

                <p className="mt-2 max-w-3xl text-sm text-slate-600">
                  Samantekt úr nýjustu
                  tryggingaupplýsingunum sem
                  GLÖGGT hefur greint. Eldri
                  tryggingaskjöl eru ekki
                  blönduð inn í þessa
                  samantekt.
                </p>
              </div>

              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {formatDate(
                  latestInsurance.latestCreatedAt
                )}
              </span>
            </div>
          </div>

          <div className="grid gap-4 border-b p-5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                Ársiðgjöld samkvæmt tilboði
              </p>

              <p className="mt-1 text-xl font-bold text-slate-900">
                {quotedAnnualPremium !== null
                  ? formatKr(
                      quotedAnnualPremium
                    )
                  : "Ekki greint"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                Hæsta tryggingarfjárhæð
              </p>

              <p className="mt-1 text-xl font-bold text-slate-900">
                {highestCoverage !== null
                  ? formatKr(
                      highestCoverage
                    )
                  : "Ekki greint"}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                Ökutæki
              </p>

              <p className="mt-1 text-xl font-bold text-slate-900">
                {insuranceVehicles.length}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-sm text-slate-500">
                Tryggingar
              </p>

              <p className="mt-1 text-xl font-bold text-slate-900">
                {insuranceItems.length}
              </p>
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold text-slate-900">
                Það sem kemur fram
              </h3>

              <div className="mt-3 space-y-3">
                {insuranceVehicles.length >
                  0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Ökutæki
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {insuranceVehicles.map(
                        (vehicle) => (
                          <span
                            key={vehicle.id}
                            className="rounded-full border bg-white px-3 py-1 text-sm text-slate-700"
                          >
                            {vehicle.name}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {insuranceProperties.length >
                  0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Fasteignir
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {insuranceProperties.map(
                        (property) => (
                          <span
                            key={property.id}
                            className="rounded-full border bg-white px-3 py-1 text-sm text-slate-700"
                          >
                            {property.name}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {insuranceItems.length >
                  0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Greindar tryggingar
                    </p>

                    <div className="mt-2 space-y-1 text-sm text-slate-600">
                      {insuranceItems
                        .slice(0, 10)
                        .map((item) => (
                          <p key={item.id}>
                            • {item.name}
                          </p>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-900">
                Áhætta og fjárhæðir
              </h3>

              <div className="mt-3 space-y-3">
                {possibleRefund !== null && (
                  <div className="flex items-start justify-between gap-4 border-b pb-3">
                    <span className="text-sm text-slate-600">
                      Möguleg endurgreiðsla
                    </span>

                    <span className="text-sm font-semibold text-slate-900">
                      {formatKr(possibleRefund)}
                    </span>
                  </div>
                )}

                {conditionalAnnualPremium !==
                  null && (
                  <div className="flex items-start justify-between gap-4 border-b pb-3">
                    <span className="text-sm text-slate-600">
                      Ársiðgjöld ef skilyrt endurgreiðsla fæst
                    </span>

                    <span className="text-sm font-semibold text-slate-900">
                      {formatKr(
                        conditionalAnnualPremium
                      )}
                    </span>
                  </div>
                )}

                {lowestDeductible !==
                  null && (
                  <div className="flex items-start justify-between gap-4 border-b pb-3">
                    <span className="text-sm text-slate-600">
                      Lægsta eigin áhætta
                    </span>

                    <span className="text-sm font-semibold text-slate-900">
                      {formatKr(
                        lowestDeductible
                      )}
                    </span>
                  </div>
                )}

                {highestDeductible !==
                  null && (
                  <div className="flex items-start justify-between gap-4 border-b pb-3">
                    <span className="text-sm text-slate-600">
                      Hæsta eigin áhætta
                    </span>

                    <span className="text-sm font-semibold text-slate-900">
                      {formatKr(
                        highestDeductible
                      )}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <span className="text-sm text-slate-600">
                    Greindar staðreyndir úr
                    skjalinu
                  </span>

                  <span className="text-sm font-semibold text-slate-900">
                    {
                      latestInsurance.facts
                        .length
                    }
                  </span>
                </div>
              </div>

              <details className="mt-5 rounded-lg border">
                <summary className="cursor-pointer p-3 text-sm font-medium text-slate-700">
                  Sjá nánari
                  tryggingaupplýsingar
                </summary>

                <div className="divide-y border-t">
                  {latestInsurance.facts.map(
                    (fact) => (
                      <div
                        key={fact.id}
                        className="flex items-start justify-between gap-4 p-3 text-sm"
                      >
                        <span className="text-slate-600">
                          {fact.label ||
                            humanizeCode(
                              fact.factType
                            )}
                        </span>

                        <span className="text-right font-medium text-slate-900">
                          {formatFactValue(
                            fact
                          )}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </details>
            </div>
          </div>
        </section>
      )}

      {!hasInsightData ? (
        <section className="mt-8 rounded-xl border bg-white p-6">
          <h2 className="text-xl font-bold text-slate-900">
            Innsýn er að byggjast upp
          </h2>

          <p className="mt-2 max-w-2xl text-slate-600">
            Engin semantic Innsýn-gögn hafa
            verið vistuð fyrir þetta fyrirtæki
            enn.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-8 rounded-xl border bg-white">
            <div className="border-b p-5">
              <h2 className="text-xl font-bold text-slate-900">
                Yfirlit Innsýnar
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Samantekt á því sem GLÖGGT
                hefur greint í skjölum
                fyrirtækisins.
              </p>
            </div>

            <div className="grid gap-6 p-5 lg:grid-cols-2">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Það sem kemur fram í
                  skjölunum
                </h3>

                {detectedAreas.length ===
                0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Engin flokkuð fyrirbæri
                    hafa verið greind enn.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detectedAreas.map(
                      ([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full border bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        >
                          {humanizeCode(type)}{" "}
                          <span className="font-semibold">
                            {count}
                          </span>
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  Nýjustu
                  lykilupplýsingar
                </h3>

                {importantFacts.length ===
                0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    Engar lykilupplýsingar
                    hafa verið greindar enn.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {importantFacts.map(
                      (fact) => (
                        <div
                          key={fact.id}
                          className="flex items-start justify-between gap-4"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">
                              {fact.label ||
                                humanizeCode(
                                  fact.factType
                                )}
                            </p>

                            {fact.label && (
                              <p className="mt-0.5 text-xs text-slate-400">
                                {humanizeCode(
                                  fact.factType
                                )}
                              </p>
                            )}
                          </div>

                          <p className="text-right text-sm font-semibold text-slate-900">
                            {formatFactValue(
                              fact
                            )}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <details className="mt-6 rounded-xl border bg-white">
            <summary className="cursor-pointer p-5 text-lg font-semibold text-slate-900">
              Það sem GLÖGGT þekkir
            </summary>

            <div className="border-t">
              {entities.length === 0 ? (
                <div className="p-5 text-sm text-slate-500">
                  Engin Innsýn-fyrirbæri hafa
                  verið greind enn.
                </div>
              ) : (
                <div className="grid gap-4 p-5 lg:grid-cols-2">
                  {entities.map(
                    (entity) => (
                      <div
                        key={entity.id}
                        className="rounded-xl border bg-slate-50/50 p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {
                                entity.name
                              }
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              {humanizeCode(
                                entity.entityType
                              )}
                            </p>
                          </div>

                          {entity.relationshipStatus && (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                              {humanizeCode(
                                entity.relationshipStatus
                              )}
                            </span>
                          )}
                        </div>

                        {entity.identifierValue && (
                          <p className="mt-3 text-sm text-slate-600">
                            {entity.identifierType
                              ? `${humanizeCode(
                                  entity.identifierType
                                )}: `
                              : ""}
                            {
                              entity.identifierValue
                            }
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </details>

          <details className="mt-6 rounded-xl border bg-white">
            <summary className="cursor-pointer p-5 text-lg font-semibold text-slate-900">
              Nánari staðreyndir úr Innsýn
            </summary>

            <div className="border-t">
              {facts.length === 0 ? (
                <div className="p-5 text-sm text-slate-500">
                  Engar Innsýn-staðreyndir
                  hafa verið vistaðar enn.
                </div>
              ) : (
                <div className="divide-y">
                  {facts.map((fact) => (
                    <div
                      key={fact.id}
                      className="p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {fact.label ||
                              humanizeCode(
                                fact.factType
                              )}
                          </p>

                          {fact.label && (
                            <p className="mt-1 text-xs text-slate-500">
                              {humanizeCode(
                                fact.factType
                              )}
                            </p>
                          )}
                        </div>

                        <p className="font-semibold text-slate-900">
                          {formatFactValue(
                            fact
                          )}
                        </p>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>
                          Heimild:{" "}
                          {humanizeCode(
                            fact.source
                          )}
                        </span>

                        {fact.confidence !==
                          null && (
                          <span>
                            Öryggi:{" "}
                            {Math.round(
                              fact.confidence *
                                100
                            )}
                            %
                          </span>
                        )}

                        <span>
                          {formatDate(
                            fact.createdAt
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </>
      )}

      <section className="mt-6 rounded-xl border bg-white">
        <div className="border-b p-5">
          <h2 className="text-xl font-bold text-slate-900">
            Fjárhagsatburðir
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Atburðir sem GLÖGGT hefur tengt
            saman úr skjölum, til dæmis kröfur,
            greiðslur, uppgjör og afborganir.
          </p>
        </div>

        {financialEvents.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">
            Engir fjárhagsatburðir hafa verið
            tengdir enn. Innsýn-gögn geta
            samt þegar verið til í formi
            fyrirbæra og staðreynda.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">
                    Dagsetning
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Atburður
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Tegund
                  </th>

                  <th className="px-5 py-3 font-medium">
                    Staða
                  </th>

                  <th className="px-5 py-3 text-right font-medium">
                    Upphæð
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {financialEvents.map(
                  (event) => (
                    <tr key={event.id}>
                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(
                          event.eventDate
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">
                          {event.title ||
                            "Ónefndur atburður"}
                        </p>

                        {event.externalReference && (
                          <p className="mt-1 text-xs text-slate-500">
                            {
                              event.externalReference
                            }
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {humanizeCode(
                          event.eventType
                        )}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {humanizeCode(
                          event.status
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-medium text-slate-900">
                        {event.amount !== null
                          ? event.currency ===
                            "ISK"
                            ? formatKr(
                                Number(
                                  event.amount
                                )
                              )
                            : `${formatNumber(
                                Number(
                                  event.amount
                                ),
                                {
                                  maximumFractionDigits: 2,
                                }
                              )} ${
                                event.currency
                              }`
                          : "—"}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <details className="rounded-xl border bg-white">
          <summary className="cursor-pointer p-5 text-lg font-semibold text-slate-900">
            VSK-yfirlit
          </summary>

          <div className="border-t p-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <p className="text-sm text-slate-500">
                  Útskattur
                </p>

                <p className="mt-1 text-xl font-bold">
                  {formatKr(outputVat)}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Innskattur
                </p>

                <p className="mt-1 text-xl font-bold">
                  {formatKr(inputVat)}
                </p>
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Staða VSK
                </p>

                <p className="mt-1 text-xl font-bold">
                  {formatKr(vatBalance)}
                </p>
              </div>
            </div>
          </div>
        </details>

        <details className="rounded-xl border bg-white">
          <summary className="cursor-pointer p-5 text-lg font-semibold text-slate-900">
            Innsýn-vinnsla
            {activeProcessingJobs > 0
              ? ` – ${activeProcessingJobs} í vinnslu`
              : ""}
          </summary>

          <div className="border-t">
            {processingJobs.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">
                Engin Innsýn-vinnsla hefur
                verið skráð.
              </div>
            ) : (
              <div className="divide-y">
                {processingJobs.map(
                  (job) => (
                    <div
                      key={job.id}
                      className="p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-slate-900">
                            Innsýn #{job.id}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {humanizeCode(
                              job.jobType
                            )}{" "}
                            ·{" "}
                            {formatDate(
                              job.createdAt
                            )}
                          </p>
                        </div>

                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {humanizeCode(
                            job.status
                          )}
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-slate-600">
                        Lokið{" "}
                        {job.completedItems} af{" "}
                        {job.totalItems}
                        {job.failedItems > 0
                          ? ` · Mistókst ${job.failedItems}`
                          : ""}
                        {job.processingItems >
                        0
                          ? ` · Í vinnslu ${job.processingItems}`
                          : ""}
                        {job.pendingItems > 0
                          ? ` · Bíður ${job.pendingItems}`
                          : ""}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}