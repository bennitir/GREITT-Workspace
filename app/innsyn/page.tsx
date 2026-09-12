import { getEffectiveUser } from "@/lib/core/access-control";
import { formatNumber } from "@/lib/locale";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { innsynText, innsynCodeLabel, innsynFactLabel, innsynFactValue, innsynUnitLabel, innsynUnconfirmedPayer, innsynInsuranceCount } from "@/lib/i18n/innsyn";
import { accountDisplayName } from "@/lib/i18n/accounts";

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

function humanizeCode(value: string | null | undefined, language: string = "is") {
  return innsynCodeLabel(value, language);
}

function formatFactValue(fact: {
  numberValue: unknown;
  textValue: string | null;
  dateValue: Date | null;
  booleanValue: boolean | null;
  unit: string | null;
  currency: string | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
}, language: string = "is") {
  if (fact.numberValue !== null) {
    const value = Number(fact.numberValue);

    if (fact.currency === "ISK") {
      return formatKr(value);
    }

    const formatted = formatNumber(value, {
      maximumFractionDigits: 2,
    });

    if (fact.unit) {
      return `${formatted} ${innsynUnitLabel(fact.unit, language)}`;
    }

    if (fact.currency) {
      return `${formatted} ${fact.currency}`;
    }

    return formatted;
  }

  if (fact.textValue) {
    return innsynFactValue(fact.textValue, (fact as { label?: string | null }).label, language);
  }

  if (fact.dateValue) {
    return formatDate(fact.dateValue);
  }

  if (fact.booleanValue !== null) {
    return fact.booleanValue ? (language === "en" ? "Yes" : language === "pl" ? "Tak" : language === "sr" ? "Да" : "Já") : (language === "en" ? "No" : language === "pl" ? "Nie" : language === "sr" ? "Не" : "Nei");
  }

  if (fact.periodStart || fact.periodEnd) {
    return `${formatDate(
      fact.periodStart ?? null
    )} – ${formatDate(
      fact.periodEnd ?? null
    )}`;
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

function normalizeFactType(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function parseYearMonth(value: string | null | undefined) {
  const match = (value ?? "").match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
}

function yearMonthFromDate(value: Date | null | undefined) {
  if (!value) {
    return null;
  }

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function formatYearMonth(value: string | null, language: string = "is") {
  if (!value) {
    return language === "en" ? "Unknown period" : language === "pl" ? "Nieznany okres" : language === "sr" ? "Непознат период" : "Óþekkt tímabil";
  }

  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return value;
  }

  const locale = language === "en" ? "en-GB" : language === "pl" ? "pl-PL" : language === "sr" ? "sr-RS" : "is-IS";
  const monthName = new Intl.DateTimeFormat(locale, {
    month: "long",
  }).format(new Date(year, month - 1, 1));

  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
}

function isActualDisabilityPensionFact(fact: {
  factType: string;
  label: string | null;
  numberValue: unknown;
}) {
  if (fact.numberValue === null) {
    return false;
  }

  const type = normalizeFactType(fact.factType);
  const label = normalizeText(fact.label);

  if (
    label.includes("tekjuaætlun") ||
    label.includes("tekjuaaetlun") ||
    label.includes("aætlad") ||
    label.includes("aaetlad")
  ) {
    return false;
  }

  if (
    label.includes("barnalifeyrir") ||
    label.includes("bifreid") ||
    label.includes("okutaeki") ||
    label.includes("okutaekja")
  ) {
    return false;
  }

  // Venjulegur örorkulífeyrir, einnig þegar beygingin er
  // t.d. „örorkulífeyris“ í heiti uppbótar.
  const saysDisabilityPension =
    label.includes("ororkulifeyr");

  // Orlofs-/desemberuppbætur eru raunverulegar tekjur en
  // eiga ekki að ruglast saman við tekjuáætlanir.
  const saysHolidayOrDecemberSupplement =
    label.includes("orlofs") ||
    label.includes("desemberuppbot");

  return (
    saysDisabilityPension ||
    saysHolidayOrDecemberSupplement ||
    type === "PENSION_INCOME"
  );
}

function isTaxableDisabilityPensionCorrectionFact(fact: {
  factType: string;
  label: string | null;
  numberValue: unknown;
  periodStart: Date | null;
  periodEnd: Date | null;
}) {
  if (fact.numberValue === null) {
    return false;
  }

  const label = normalizeText(fact.label);

  if (
    label.includes("tekjuaætlun") ||
    label.includes("tekjuaaetlun") ||
    label.includes("barnalifeyrir") ||
    label.includes("bifreid") ||
    label.includes("okutaeki") ||
    label.includes("okutaekja") ||
    label.includes("ostadgreidsluskyld")
  ) {
    return false;
  }

  const saysCorrection =
    label.includes("leidrett") &&
    label.includes("rettindi");

  const saysTaxable =
    label.includes("stadgreidsluskyld");

  if (!saysCorrection || !saysTaxable) {
    return false;
  }

  // Við tökum aðeins sjálfvirkt inn leiðréttingu sem tilheyrir
  // einum mánuði. Fjölmánaða leiðréttingu á ekki að dreifa
  // eftir ágiskun.
  const startMonth = yearMonthFromDate(fact.periodStart);
  const endMonth = yearMonthFromDate(fact.periodEnd);

  return (
    startMonth !== null &&
    endMonth !== null &&
    startMonth === endMonth
  );
}

function isDisabilityPensionPaymentTypeFact(fact: {
  factType: string;
  textValue: string | null;
}) {
  return (
    normalizeFactType(fact.factType) === "PAYMENT_TYPE" &&
    normalizeText(fact.textValue).includes("ororkulifeyrir")
  );
}

function isGrossPensionFallbackFact(fact: {
  factType: string;
  label: string | null;
  numberValue: unknown;
}) {
  if (fact.numberValue === null) {
    return false;
  }

  const type = normalizeFactType(fact.factType);
  const label = normalizeText(fact.label);

  return (
    type === "GROSS_PENSION" ||
    label === "lifeyrir samtals"
  );
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
  const type = normalizeFactType(fact.factType);
  const label = normalizeText(fact.label);

  // Nýja Innsýn-greiningin notar INSURANCE_* tegundir.
  // Almenn FEE má EKKI teljast tryggingastaðreynd, annars geta t.d.
  // fasteignagjöld orðið „nýjasta tryggingaskjalið“ og ruglað Sjóvá-sýnina.
  if (
    type.startsWith("INSURANCE_") ||
    type === "PREMIUM" ||
    type === "COVERAGE" ||
    type === "DEDUCTIBLE"
  ) {
    return true;
  }

  // Fallback fyrir eldri tryggingaskjöl þar sem factType var almennara.
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

type ExpenseInsightCategory =
  | "Fjármögnun og lán"
  | "Bifreiðar"
  | "Banki og þjónustugjöld"
  | "Önnur útgjöld";

function getExpenseInsightCategory(account: string, name: string): ExpenseInsightCategory {
  const normalizedName = normalizeText(name);

  // Innsýn-merkið er aðskilið frá bókhaldslyklinum.
  // Við notum fyrst merkingu reikningsheitis og aðeins mjög afmarkaðar
  // þekktar vísbendingar. Bókhaldsreikningurinn sjálfur breytist ekki.
  if (
    normalizedName.includes("vext") ||
    normalizedName.includes("verdb") ||
    normalizedName.includes("verdbaet") ||
    normalizedName.includes("lan")
  ) {
    return "Fjármögnun og lán";
  }

  if (
    normalizedName.includes("bifreid") ||
    normalizedName.includes("okutaek") ||
    normalizedName.includes("bilakost")
  ) {
    return "Bifreiðar";
  }

  if (
    normalizedName.includes("bank") ||
    normalizedName.includes("innheimt") ||
    normalizedName.includes("greidslugjald") ||
    normalizedName.includes("thjonustugjald")
  ) {
    return "Banki og þjónustugjöld";
  }

  return "Önnur útgjöld";
}

export default async function InnsynPage() {
  const cookieStore = await cookies();
  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: activeUser.id },
    select: { interfaceLanguage: true },
  });
  const interfaceLanguage = userSettings?.interfaceLanguage ?? "is";
  const t = innsynText(interfaceLanguage);

  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold">
          {t.title}
        </h1>

        <p className="mt-4 text-lg text-slate-600">
          {t.noCompany}
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
    incomeFacts,
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
        name: true,
        entryRole: true,
        type: true,
      },
    }),

    prisma.receipt.findMany({
      where: {
        companyId,
      },
      select: {
        id: true,
        date: true,
        description: true,
        merchantName: true,
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
      take: 250,
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

        accountLinks: {
          where: {
            role: "LIABILITY_PRINCIPAL",
            status: "CONFIRMED",
          },
          select: {
            accountId: true,
            role: true,
            status: true,
            account: {
              select: {
                number: true,
                name: true,
              },
            },
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
        periodStart: true,
        periodEnd: true,
        createdAt: true,
      },
    }),

    prisma.insightFact.findMany({
      where: {
        companyId,
        OR: [
          {
            label: {
              contains: "lífeyr",
              mode: "insensitive",
            },
          },
          {
            label: {
              contains: "örorku",
              mode: "insensitive",
            },
          },
          {
            label: {
              contains: "staðgreiðsluskyld",
              mode: "insensitive",
            },
          },
          {
            label: {
              contains: "desemberuppbót",
              mode: "insensitive",
            },
          },
          {
            label: {
              contains: "orlofs",
              mode: "insensitive",
            },
          },
          {
            label: {
              in: [
                "Tímabil lífeyrisseðils",
                "Lífeyrir samtals",
                "Staðgreiðsla samtals",
                "Útborgað samtals",
              ],
            },
          },
          {
            factType: {
              in: [
                "PENSION_INCOME",
                "GROSS_PENSION",
                "PAYMENT_TYPE",
              ],
            },
          },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 1000,
      select: {
        id: true,
        receiptId: true,
        documentId: true,
        factType: true,
        label: true,
        numberValue: true,
        textValue: true,
        periodStart: true,
        periodEnd: true,
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

  const accountNameByNumber = new Map(
    accounts.map((account) => [
      account.number,
      accountDisplayName(account.number, account.name, interfaceLanguage),
    ])
  );

  const expenseBreakdown = new Map<
    string,
    {
      account: string;
      name: string;
      amount: number;
      receiptIds: Set<number>;
    }
  >();

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
        const expenseAmount = entry.debit - entry.credit;
        expenses += expenseAmount;

        const currentExpense = expenseBreakdown.get(entry.account);
        expenseBreakdown.set(entry.account, {
          account: entry.account,
          name:
            accountNameByNumber.get(entry.account) ??
            "Ónefndur gjaldaliður",
          amount: (currentExpense?.amount ?? 0) + expenseAmount,
          receiptIds: new Set([
            ...(currentExpense?.receiptIds ?? []),
            receipt.id,
          ]),
        });
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

  const expenseBreakdownRows = Array.from(
    expenseBreakdown.values()
  )
    .filter((item) => Math.abs(item.amount) > 0.005)
    .sort((a, b) => b.amount - a.amount);

  // Lækkun skuldar er efnahagshreyfing, ekki rekstrarútgjald.
  // Við byggjum þetta á bókhaldslegri tegund reikningsins en ekki nafni hans.
  // Debetfærsla á skulda-/lánareikning lækkar skuldina.
  const liabilityAccounts = new Set(
    accounts
      .filter(
        (account) =>
          account.type === "SHORT_TERM_LIABILITY" ||
          account.type === "LONG_TERM_LIABILITY"
      )
      .map((account) => account.number)
  );

  const principalRepayments = receipts
    .flatMap((receipt) =>
      receipt.entries
        .filter(
          (entry) =>
            liabilityAccounts.has(entry.account) &&
            entry.debit - entry.credit > 0.005
        )
        .map((entry) => {
          // Finna fyrst lán sem er staðfest á sama skuldareikning.
          // Ef sama upprunaskjal tengist nákvæmlega einu slíku láni notum við það.
          // Ef skjalatengingin vantar en aðeins eitt staðfest lán notar reikninginn,
          // má samt sýna það án ágiskunar. Ef fleiri en eitt lán deila reikningnum
          // og skjalið greinir þau ekki að, sýnum við ekkert lánsnúmer.
          const loansForAccount = entities.filter(
            (entity) =>
              normalizeFactType(entity.entityType) === "LOAN" &&
              entity.accountLinks.some(
                (link) => link.account.number === entry.account
              )
          );

          const loansForReceiptAndAccount = loansForAccount.filter(
            (entity) =>
              entity.documentLinks.some(
                (link) => link.receiptId === receipt.id
              )
          );

          // Eldri Festa-fylgiskjöl geta borið gamla handvirka lánatengingu frá því
          // áður en raunverulegt Festa-lánsnúmer var staðfest. Þegar GLÖGGT hefur
          // síðan nákvæmlega eitt Festa-lán á sama skuldareikningi sem er stutt af
          // endurtekinni skjalatengingu (2+ skjöl), notum við þá nýrri staðfestu
          // þekkingu aðeins til birtingar í Innsýn. Fjárhæðin kemur áfram eingöngu
          // úr bókuðu færslunni og breytist því ekki.
          const normalizedSourceName = normalizeText(
            receipt.merchantName?.trim() || receipt.description?.trim() || ""
          );

          const repeatedFestaLoans = normalizedSourceName.includes("festa")
            ? loansForAccount.filter(
                (entity) =>
                  normalizeText(entity.name).includes("festa") &&
                  entity.documentLinks.length >= 2
              )
            : [];

          const matchedLoan =
            repeatedFestaLoans.length === 1
              ? repeatedFestaLoans[0]
              : loansForReceiptAndAccount.length === 1
                ? loansForReceiptAndAccount[0]
                : loansForReceiptAndAccount.length === 0 &&
                    loansForAccount.length === 1
                  ? loansForAccount[0]
                  : null;

          return {
            receiptId: receipt.id,
            date: receipt.date,
            sourceName:
              receipt.merchantName?.trim() ||
              receipt.description?.trim() ||
              `${t.voucher} #${receipt.id}`,
            account: entry.account,
            accountName:
              accountNameByNumber.get(entry.account) ??
              t.liabilityAccount,
            loanName: matchedLoan?.name?.trim() || null,
            loanNumber: matchedLoan?.identifierValue?.trim() || null,
            amount: entry.debit - entry.credit,
          };
        })
    )
    .sort(
      (a, b) =>
        (a.date?.getTime() ?? 0) -
          (b.date?.getTime() ?? 0) ||
        a.receiptId - b.receiptId
    );

  const principalRepaymentTotal = principalRepayments.reduce(
    (sum, item) => sum + item.amount,
    0
  );


  const expenseEntityNames = (
    item: (typeof expenseBreakdownRows)[number],
    entityType: "LOAN" | "VEHICLE"
  ) => {
    const names = new Set<string>();

    for (const entity of entities) {
      if (normalizeFactType(entity.entityType) !== entityType) {
        continue;
      }

      const linkedToExpense = entity.documentLinks.some(
        (link) =>
          link.receiptId !== null &&
          item.receiptIds.has(link.receiptId)
      );

      if (linkedToExpense) {
        names.add(entity.name);
      }
    }

    return Array.from(names).sort((a, b) =>
      a.localeCompare(b, "is")
    );
  };

  const expenseReceiptSources = (
    item: (typeof expenseBreakdownRows)[number]
  ) =>
    receipts
      .filter((receipt) => item.receiptIds.has(receipt.id))
      .map((receipt) => {
        const amount = receipt.entries
          .filter((entry) => entry.account === item.account)
          .reduce(
            (sum, entry) => sum + (entry.debit - entry.credit),
            0
          );

        return {
          id: receipt.id,
          date: receipt.date,
          label:
            receipt.merchantName?.trim() ||
            receipt.description?.trim() ||
            `${t.voucher} #${receipt.id}`,
          amount,
        };
      })
      .filter((source) => Math.abs(source.amount) > 0.005)
      .sort(
        (a, b) =>
          (a.date?.getTime() ?? 0) -
            (b.date?.getTime() ?? 0) ||
          a.id - b.id
      );

  const knownLoans = entities
    .filter((entity) => normalizeFactType(entity.entityType) === "LOAN")
    .map((entity) => ({
      id: entity.id,
      name: entity.name,
      identifierValue: entity.identifierValue,
      confirmedLiabilityAccounts: entity.accountLinks.map((link) => ({
        number: link.account.number,
        name: accountDisplayName(
          link.account.number,
          link.account.name,
          interfaceLanguage
        ),
      })),
      documentCount: entity.documentLinks.length,
    }))
    .filter((loan) => loan.confirmedLiabilityAccounts.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "is"));

  const expenseInsightGroups = Array.from(
    expenseBreakdownRows.reduce(
      (groups, item) => {
        const category = getExpenseInsightCategory(item.account, item.name);
        const current = groups.get(category) ?? {
          category,
          amount: 0,
          items: [] as Array<
            (typeof expenseBreakdownRows)[number] & {
              linkedEntities: string[];
            }
          >,
        };

        const linkedEntities =
          category === "Fjármögnun og lán"
            ? expenseEntityNames(item, "LOAN")
            : category === "Bifreiðar"
              ? expenseEntityNames(item, "VEHICLE")
              : [];

        current.amount += item.amount;
        current.items.push({
          ...item,
          linkedEntities,
        });
        groups.set(category, current);

        return groups;
      },
      new Map<
        ExpenseInsightCategory,
        {
          category: ExpenseInsightCategory;
          amount: number;
          items: Array<
            (typeof expenseBreakdownRows)[number] & {
              linkedEntities: string[];
            }
          >;
        }
      >()
    ).values()
  ).sort((a, b) => b.amount - a.amount);

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
  // TEKJUR ÚR ÖRORKULÍFEYRI OG LÍFEYRISSJÓÐUM
  //
  // Rekstrartekjur hér fyrir ofan halda áfram að koma úr
  // bókhaldsfærslum. Þessi samantekt er aðskilin Innsýn úr
  // staðreyndum í skjölum og telur aðeins raunverulegar
  // örorkulífeyris-/lífeyrisfjárhæðir, ekki tekjuáætlanir.
  // ==========================================================

  const pensionGroups = new Map<
    string,
    {
      receiptId: number | null;
      documentId: number | null;
      facts: typeof incomeFacts;
    }
  >();

  for (const fact of incomeFacts) {
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

    const current = pensionGroups.get(key);

    if (current) {
      current.facts.push(fact);
      continue;
    }

    pensionGroups.set(key, {
      receiptId: fact.receiptId,
      documentId: fact.documentId,
      facts: [fact],
    });
  }

  const incomePayerCandidatesByDocument = new Map<
    string,
    Set<string>
  >();

  const incomePayerEntityTypes = new Set([
    "ORGANIZATION",
    "COMPANY",
    "PENSION_FUND",
    "FUND",
    "GOVERNMENT_AGENCY",
    "AGENCY",
    "INSTITUTION",
  ]);

  for (const entity of entities) {
    const entityType = normalizeFactType(
      entity.entityType
    );

    if (!incomePayerEntityTypes.has(entityType)) {
      continue;
    }

    for (const link of entity.documentLinks) {
      const key = documentKey(
        link.receiptId,
        link.documentId
      );

      const current =
        incomePayerCandidatesByDocument.get(key) ??
        new Set<string>();

      current.add(entity.name);
      incomePayerCandidatesByDocument.set(
        key,
        current
      );
    }
  }

  const monthlyPensionIncome = new Map<
    string,
    number
  >();

  const monthlyPensionIncomeByPayer = new Map<
    string,
    Map<string, number>
  >();

  const addPensionIncome = (
    period: string,
    payer: string,
    amount: number
  ) => {
    monthlyPensionIncome.set(
      period,
      (monthlyPensionIncome.get(period) ?? 0) + amount
    );

    const payerTotals =
      monthlyPensionIncomeByPayer.get(period) ??
      new Map<string, number>();

    payerTotals.set(
      payer,
      (payerTotals.get(payer) ?? 0) + amount
    );

    monthlyPensionIncomeByPayer.set(
      period,
      payerTotals
    );
  };

  let pensionIncomeDocumentCount = 0;
  let pensionIncomeWithoutPeriod = 0;
  let pensionIncomeWithoutConfirmedPayer = 0;

  for (const group of pensionGroups.values()) {
    const groupKey = documentKey(
      group.receiptId,
      group.documentId
    );

    const payerCandidates = Array.from(
      incomePayerCandidatesByDocument.get(groupKey) ??
        []
    ).filter((name) => name.trim().length > 0);

    const normalizedPayerCandidates =
      payerCandidates.map((name) => ({
        name,
        normalized: normalizeText(name),
      }));

    const trCandidate =
      normalizedPayerCandidates.find(
        (candidate) =>
          candidate.normalized.includes(
            "tryggingastofnun"
          )
      );

    const nonBankPayerCandidates =
      normalizedPayerCandidates.filter(
        (candidate) =>
          !candidate.normalized.includes("banki") &&
          !candidate.normalized.includes("bank")
      );

    const payerName =
      trCandidate?.name ??
      (nonBankPayerCandidates.length === 1
        ? nonBankPayerCandidates[0].name
        : "Óstaðfestur greiðandi");

    const actualIncomeFacts = group.facts.filter(
      isActualDisabilityPensionFact
    );

    const correctionFacts = group.facts.filter(
      isTaxableDisabilityPensionCorrectionFact
    );

    const incomeFactsToAllocate = [
      ...actualIncomeFacts,
      ...correctionFacts.filter(
        (correctionFact) =>
          !actualIncomeFacts.some(
            (actualFact) =>
              actualFact.id === correctionFact.id
          )
      ),
    ];

    const periodFact = group.facts.find(
      (fact) =>
        normalizeFactType(fact.factType) ===
          "PERIOD" ||
        normalizeText(fact.label).includes(
          "timabil lifeyrissedils"
        )
    );

    let groupAddedIncome = false;
    let groupHasIncomeWithoutPeriod = false;

    for (const incomeFact of incomeFactsToAllocate) {
      if (incomeFact.numberValue === null) {
        continue;
      }

      const amount = Number(incomeFact.numberValue);

      if (!Number.isFinite(amount) || amount === 0) {
        continue;
      }

      const periodKey =
        yearMonthFromDate(
          incomeFact.periodStart ??
            incomeFact.periodEnd ??
            null
        ) ??
        parseYearMonth(periodFact?.textValue) ??
        yearMonthFromDate(
          periodFact?.periodStart ??
            periodFact?.periodEnd ??
            null
        );

      if (!periodKey) {
        groupHasIncomeWithoutPeriod = true;
        continue;
      }

      const normalizedIncomeLabel =
        normalizeText(incomeFact.label);

      const allocatedPayerName =
        normalizedIncomeLabel.includes("fra gildi")
          ? "Greiðslustofa lífeyrissjóða · Gildi"
          : normalizedIncomeLabel.includes("fra festu") ||
              normalizedIncomeLabel.includes("fra festa")
            ? "Greiðslustofa lífeyrissjóða · Festa"
            : payerName;

      addPensionIncome(
        periodKey,
        allocatedPayerName,
        amount
      );

      groupAddedIncome = true;
    }

    // Eldri/öðruvísi lífeyrisskjöl geta sagt PAYMENT_TYPE =
    // Örorkulífeyrir en geymt brúttófjárhæðina sem GROSS_PENSION
    // eða „Lífeyrir samtals“. Þá höldum við fallback-reglunni.
    if (!groupAddedIncome) {
      const saysDisabilityPension =
        group.facts.some(
          isDisabilityPensionPaymentTypeFact
        );

      if (saysDisabilityPension) {
        const fallbackFact = group.facts.find(
          isGrossPensionFallbackFact
        );

        if (
          fallbackFact &&
          fallbackFact.numberValue !== null
        ) {
          const fallbackAmount = Number(
            fallbackFact.numberValue
          );

          const fallbackPeriodKey =
            yearMonthFromDate(
              fallbackFact.periodStart ??
                fallbackFact.periodEnd ??
                null
            ) ??
            parseYearMonth(periodFact?.textValue) ??
            yearMonthFromDate(
              periodFact?.periodStart ??
                periodFact?.periodEnd ??
                null
            );

          if (
            Number.isFinite(fallbackAmount) &&
            fallbackAmount !== 0 &&
            fallbackPeriodKey
          ) {
            addPensionIncome(
              fallbackPeriodKey,
              payerName,
              fallbackAmount
            );

            groupAddedIncome = true;
          } else if (
            Number.isFinite(fallbackAmount) &&
            fallbackAmount !== 0
          ) {
            groupHasIncomeWithoutPeriod = true;
          }
        }
      }
    }

    if (groupAddedIncome) {
      pensionIncomeDocumentCount += 1;

      const hasConfirmedPensionSource =
        group.facts.some((fact) => {
          const label = normalizeText(fact.label);

          return (
            label.includes("fra gildi") ||
            label.includes("fra festu") ||
            label.includes("fra festa")
          );
        });

      if (
        payerName === "Óstaðfestur greiðandi" &&
        !hasConfirmedPensionSource
      ) {
        pensionIncomeWithoutConfirmedPayer += 1;
      }
    }

    if (groupHasIncomeWithoutPeriod) {
      pensionIncomeWithoutPeriod += 1;
    }
  }

  const currentYear = new Date().getFullYear();

  const pensionIncomeMonths = Array.from(
    monthlyPensionIncome.entries()
  )
    .map(([period, amount]) => ({
      period,
      amount,
      payers: Array.from(
        monthlyPensionIncomeByPayer.get(period)?.entries() ??
          []
      )
        .map(([name, payerAmount]) => ({
          name,
          amount: payerAmount,
        }))
        .sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) =>
      b.period.localeCompare(a.period)
    );

  const pensionIncomeCurrentYear =
    pensionIncomeMonths
      .filter((item) =>
        item.period.startsWith(`${currentYear}-`)
      )
      .reduce(
        (sum, item) => sum + item.amount,
        0
      );

  const latestPensionIncome =
    pensionIncomeMonths[0] ?? null;

  // Innsýn sýnir fjárhagsmyndina sem GLÖGGT þekkir, ekki aðeins bókaðar færslur.
  // Fyrsta skrefið: staðfestar lífeyris-/greiðslutekjur úr skjölum teljast með innkomu.
  // Bókaðar tekjur eru áfram sýndar í sundurliðun svo uppruni tölunnar sé rekjanlegur.
  const insightIncome = revenue + pensionIncomeCurrentYear;
  const insightExpenses = expenses;
  const insightBalance = insightIncome - insightExpenses;

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
  const insurancePeriodFact =
    latestInsurance?.facts.find(
      (fact) =>
        fact.periodStart !== null ||
        fact.periodEnd !== null
    ) ?? null;

  const insurancePeriod =
    insurancePeriodFact &&
    (insurancePeriodFact.periodStart ||
      insurancePeriodFact.periodEnd)
      ? `${formatDate(
          insurancePeriodFact.periodStart
        )} – ${formatDate(
          insurancePeriodFact.periodEnd
        )}`
      : null;

  const insuranceFactsForDisplay =
    latestInsurance?.facts.filter(
      (fact, index, allFacts) => {
        const label = normalizeText(fact.label);
        const isPeriodFact =
          fact.factType.toUpperCase() === "PERIOD" ||
          label.includes("tryggingatimabil") ||
          label.includes("vatryggingartimabil");

        if (!isPeriodFact) {
          return true;
        }

        return (
          allFacts.findIndex((otherFact) => {
            const otherLabel = normalizeText(
              otherFact.label
            );
            const otherIsPeriodFact =
              otherFact.factType.toUpperCase() ===
                "PERIOD" ||
              otherLabel.includes(
                "tryggingatimabil"
              ) ||
              otherLabel.includes(
                "vatryggingartimabil"
              );

            return (
              otherIsPeriodFact &&
              otherFact.periodStart?.getTime() ===
                fact.periodStart?.getTime() &&
              otherFact.periodEnd?.getTime() ===
                fact.periodEnd?.getTime()
            );
          }) === index
        );
      }
    ) ?? [];

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

      const insurancePremiumMovementTypes = new Set([
    "INSURANCE_PREMIUM",
    "INSURANCE_PREMIUM_ADJUSTMENT",
    "INSURANCE_PREMIUM_REVERSAL",
  ]);

  const insurancePremiumMovements =
    latestInsurance?.facts
      .filter(
        (fact) =>
          fact.numberValue !== null &&
          insurancePremiumMovementTypes.has(
            normalizeFactType(fact.factType)
          )
      )
      .map((fact) => ({
        id: fact.id,
        label:
          fact.label?.trim() ||
          "Ógreind trygging",
        factType:
          normalizeFactType(fact.factType),
        amount:
          Number(fact.numberValue),
        date:
          fact.dateValue,
        periodStart:
          fact.periodStart,
        periodEnd:
          fact.periodEnd,
      }))
      .filter((movement) =>
        Number.isFinite(movement.amount)
      ) ?? [];

  const insurancePolicies = Array.from(
    insurancePremiumMovements.reduce(
      (groups, movement) => {
        const current =
          groups.get(movement.label) ?? {
            label: movement.label,
            amount: 0,
            movements: [] as typeof insurancePremiumMovements,
          };

        current.amount += movement.amount;
        current.movements.push(movement);

        groups.set(
          movement.label,
          current
        );

        return groups;
      },
      new Map<
        string,
        {
          label: string;
          amount: number;
          movements: typeof insurancePremiumMovements;
        }
      >()
    ).values()
  )
    .map((policy) => {
      const parts =
        policy.label
          .split("·")
          .map((part) => part.trim())
          .filter(Boolean);

      const periodStart =
  policy.movements
    .map((movement) => movement.periodStart)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

const periodEnd =
  policy.movements
    .map((movement) => movement.periodEnd)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

return {
  ...policy,
  insuredItem:
    parts[0] ??
    policy.label,
  policyNumber:
    parts[1] ?? null,
  insuranceType:
    parts[2] ?? null,
  periodStart,
  periodEnd,
};
    })
    .sort((a, b) =>
      a.insuredItem.localeCompare(
        b.insuredItem,
        "is"
      )
    );

    const insuranceAssetGroups = Array.from(
  insurancePolicies.reduce(
    (groups, policy) => {
      const key = policy.insuredItem;

      const current =
        groups.get(key) ?? {
          insuredItem: policy.insuredItem,
          amount: 0,
          policies: [] as typeof insurancePolicies,
        };

      current.amount += policy.amount;
      current.policies.push(policy);

      groups.set(key, current);

      return groups;
    },
    new Map<
      string,
      {
        insuredItem: string;
        amount: number;
        policies: typeof insurancePolicies;
      }
    >()
  ).values()
).sort((a, b) =>
  a.insuredItem.localeCompare(b.insuredItem, "is")
);

  const insurancePropertyNames = new Set(
    insuranceProperties.map((property) =>
      normalizeText(property.name)
    )
  );

  const householdInsuranceAssetGroups =
    insuranceAssetGroups.filter((asset) => {
      const assetName = normalizeText(asset.insuredItem);

      return Array.from(insurancePropertyNames).some(
        (propertyName) =>
          assetName.includes(propertyName) ||
          propertyName.includes(assetName)
      );
    });

  const householdInsuranceTotal =
    householdInsuranceAssetGroups.reduce(
      (sum, asset) => sum + asset.amount,
      0
    );

  // ==========================================================
  // FASTEIGNAGJÖLD ÚR FRUMGÖGNUM
  //
  // Þetta er þekking úr greindum skjölum, ekki bókuð útgjöld.
  // Við notum aðeins heildarálagningu sem aðaltölu og sýnum
  // gjaldaliðina sem sundurliðun svo sama upphæð teljist ekki tvisvar.
  // ==========================================================

  const propertyAssessmentCandidates = facts
    .filter(
      (fact) =>
        fact.numberValue !== null &&
        normalizeFactType(fact.factType) === "FEE" &&
        normalizeText(fact.label).includes("samtals alogd gjold")
    )
    .map((totalFact) => {
      const key = documentKey(
        totalFact.receiptId,
        totalFact.documentId
      );

      const propertyEntity = entities.find(
        (entity) =>
          normalizeFactType(entity.entityType) === "PROPERTY" &&
          entity.documentLinks.some(
            (link) =>
              documentKey(
                link.receiptId,
                link.documentId
              ) === key
          )
      );

      if (!propertyEntity) {
        return null;
      }

      const detailFacts = facts
        .filter(
          (fact) =>
            documentKey(
              fact.receiptId,
              fact.documentId
            ) === key &&
            fact.id !== totalFact.id &&
            fact.numberValue !== null &&
            normalizeFactType(fact.factType) === "FEE"
        )
        .map((fact) => ({
          id: fact.id,
          label:
            fact.label?.trim() ||
            "Ógreint fasteignagjald",
          amount: Number(fact.numberValue),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.amount) &&
            Math.abs(item.amount) > 0.005
        );

      const amount = Number(totalFact.numberValue);

      if (!Number.isFinite(amount)) {
        return null;
      }

      return {
        id: totalFact.id,
        receiptId: totalFact.receiptId,
        documentId: totalFact.documentId,
        propertyName: propertyEntity.name,
        propertyIdentifier: propertyEntity.identifierValue,
        amount,
        periodStart: totalFact.periodStart,
        periodEnd: totalFact.periodEnd,
        createdAt: totalFact.createdAt,
        details: detailFacts,
      };
    })
    .filter(
      (
        assessment
      ): assessment is NonNullable<typeof assessment> =>
        assessment !== null
    );

  // Ef sama álagning hefur óvart verið greind úr tvíteknu skjali
  // sýnum við hana aðeins einu sinni í Innsýn.
  const propertyAssessments = Array.from(
    propertyAssessmentCandidates.reduce(
      (deduped, assessment) => {
        const year =
          assessment.periodStart?.getFullYear() ??
          assessment.periodEnd?.getFullYear() ??
          "unknown";

        const propertyKey = normalizeText(
          assessment.propertyIdentifier ||
            assessment.propertyName
        );

        const key =
          `${propertyKey}:${year}:${assessment.amount}`;

        const current = deduped.get(key);

        if (
          !current ||
          assessment.createdAt > current.createdAt
        ) {
          deduped.set(key, assessment);
        }

        return deduped;
      },
      new Map<
        string,
        (typeof propertyAssessmentCandidates)[number]
      >()
    ).values()
  ).sort(
    (a, b) =>
      a.propertyName.localeCompare(
        b.propertyName,
        "is"
      ) ||
      (b.periodStart?.getTime() ?? 0) -
        (a.periodStart?.getTime() ?? 0)
  );

  // ==========================================================
  // VEITUR ÚR FRUMGÖGNUM
  //
  // Heildarreikningur er sýndur einu sinni. Undirliðirnir eru
  // sundurliðun en leggjast ekki aftur við heildina.
  // ==========================================================

  const utilityDocumentGroups = Array.from(
    facts.reduce(
      (groups, fact) => {
        if (
          fact.receiptId === null &&
          fact.documentId === null
        ) {
          return groups;
        }

        const key = documentKey(
          fact.receiptId,
          fact.documentId
        );

        const current =
          groups.get(key) ?? {
            receiptId: fact.receiptId,
            documentId: fact.documentId,
            facts: [] as typeof facts,
          };

        current.facts.push(fact);
        groups.set(key, current);
        return groups;
      },
      new Map<
        string,
        {
          receiptId: number | null;
          documentId: number | null;
          facts: typeof facts;
        }
      >()
    ).values()
  );

  const householdUtilityBills = utilityDocumentGroups
    .map((group) => {
      const key = documentKey(
        group.receiptId,
        group.documentId
      );

      const serviceLocation = entities.find(
        (entity) =>
          normalizeFactType(entity.entityType) ===
            "SERVICE_LOCATION" &&
          entity.documentLinks.some(
            (link) =>
              documentKey(
                link.receiptId,
                link.documentId
              ) === key
          )
      );

      if (!serviceLocation) {
        return null;
      }

      const totalFact = group.facts.find((fact) => {
        if (fact.numberValue === null) {
          return false;
        }

        const label = normalizeText(fact.label);
        return (
          label.includes("samtals til greidslu") ||
          label.includes("heildarupphaed reiknings") ||
          label.includes("reikningur samtals")
        );
      });

      if (!totalFact?.numberValue) {
        return null;
      }

      const amount = Number(totalFact.numberValue);

      if (!Number.isFinite(amount)) {
        return null;
      }

      const detailFacts = group.facts
        .filter((fact) => {
          if (
            fact.id === totalFact.id ||
            fact.numberValue === null
          ) {
            return false;
          }

          const label = normalizeText(fact.label);

          return (
            label.includes("rafmagn") ||
            label.includes("rafdreif") ||
            label.includes("hitaveit")
          );
        })
        .map((fact) => ({
          id: fact.id,
          label:
            fact.label?.trim() ||
            "Ógreind veita",
          amount: Number(fact.numberValue),
        }))
        .filter(
          (item) =>
            Number.isFinite(item.amount) &&
            Math.abs(item.amount) > 0.005
        );

      const periodFact = group.facts.find(
        (fact) =>
          fact.periodStart !== null ||
          fact.periodEnd !== null
      );

      return {
        id: totalFact.id,
        receiptId: group.receiptId,
        documentId: group.documentId,
        propertyName: serviceLocation.name,
        propertyIdentifier:
          serviceLocation.identifierValue,
        amount,
        periodStart:
          periodFact?.periodStart ?? null,
        periodEnd:
          periodFact?.periodEnd ?? null,
        createdAt: totalFact.createdAt,
        details: detailFacts,
      };
    })
    .filter(
      (
        bill
      ): bill is NonNullable<typeof bill> =>
        bill !== null
    );

  const householdPropertyGroups = Array.from(
    [
      ...householdInsuranceAssetGroups.map((asset) => ({
        name: asset.insuredItem,
        insurance: asset,
        assessment: null as
          | (typeof propertyAssessments)[number]
          | null,
        utility: null as
          | (typeof householdUtilityBills)[number]
          | null,
      })),
      ...propertyAssessments.map((assessment) => ({
        name: assessment.propertyName,
        insurance: null as
          | (typeof householdInsuranceAssetGroups)[number]
          | null,
        assessment,
        utility: null as
          | (typeof householdUtilityBills)[number]
          | null,
      })),
      ...householdUtilityBills.map((utility) => ({
        name: utility.propertyName,
        insurance: null as
          | (typeof householdInsuranceAssetGroups)[number]
          | null,
        assessment: null as
          | (typeof propertyAssessments)[number]
          | null,
        utility,
      })),
    ].reduce(
      (groups, item) => {
        const normalizedName = normalizeText(item.name);

        const existingEntry = Array.from(
          groups.entries()
        ).find(([key]) =>
          key.includes(normalizedName) ||
          normalizedName.includes(key)
        );

        const key =
          existingEntry?.[0] ?? normalizedName;

        const current =
          existingEntry?.[1] ?? {
            name: item.name,
            insurance: null as
              | (typeof householdInsuranceAssetGroups)[number]
              | null,
            assessments: [] as typeof propertyAssessments,
            utilities: [] as typeof householdUtilityBills,
          };

        if (item.insurance) {
          current.insurance = item.insurance;
        }

        if (item.assessment) {
          current.assessments.push(item.assessment);
        }

        if (item.utility) {
          current.utilities.push(item.utility);
        }

        groups.set(key, current);
        return groups;
      },
      new Map<
        string,
        {
          name: string;
          insurance:
            | (typeof householdInsuranceAssetGroups)[number]
            | null;
          assessments: typeof propertyAssessments;
          utilities: typeof householdUtilityBills;
        }
      >()
    ).values()
  ).sort((a, b) =>
    a.name.localeCompare(b.name, "is")
  );

  const householdSourceDataTotal =
    householdPropertyGroups.reduce(
      (sum, property) =>
        sum +
        (property.insurance?.amount ?? 0) +
        property.assessments.reduce(
          (assessmentSum, assessment) =>
            assessmentSum + assessment.amount,
          0
        ) +
        property.utilities.reduce(
          (utilitySum, utility) =>
            utilitySum + utility.amount,
          0
        ),
      0
    );

  const insurancePremiumNetTotal =
    insurancePolicies.reduce(
      (sum, policy) =>
        sum + policy.amount,
      0
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
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              GLÖGGT {t.title}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
              {company.name}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              {t.intro}
            </p>
          </div>

          <div className="rounded-full border bg-white px-4 py-2 text-sm text-slate-600 shadow-sm">
            {currentYear}
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="grid lg:grid-cols-[1.35fr_1fr]">
            <div className="p-6 md:p-8">
              <p className="text-sm font-semibold text-slate-500">{t.today}</p>
              <p
                className={`mt-2 text-4xl font-bold tracking-tight md:text-5xl ${
                  insightBalance >= 0 ? "text-emerald-700" : "text-slate-950"
                }`}
              >
                {formatKr(insightBalance)}
              </p>
              <p className="mt-3 text-sm text-slate-600">
                {t.balanceDescription}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {t.comparisonDescription}
              </p>
            </div>

            <div className="grid grid-cols-2 border-t bg-slate-50/70 lg:border-l lg:border-t-0">
              <div className="border-r p-5 md:p-6">
                <a href="#innkoma-greining" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <p className="text-sm font-medium text-slate-500">{t.income}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">
                    {formatKr(insightIncome)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t.more}</p>
                </a>
              </div>
              <div className="p-5 md:p-6">
                <a href="#utgjold-greining" className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300">
                  <p className="text-sm font-medium text-slate-500">{t.expenses}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">
                    {formatKr(insightExpenses)}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{t.more}</p>
                </a>
              </div>
              <div className="col-span-2 border-t p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{t.vat}</p>
                    <p className="mt-1 text-xl font-bold text-slate-950">
                      {formatKr(vatBalance)}
                    </p>
                  </div>
                  <a
                    href="/vsk"
                    className="text-sm font-semibold text-slate-700 hover:text-slate-950"
                  >
                    {t.seeVat}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t.attention}
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">
                {t.important}
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    insightBalance < 0 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                <div>
                  <p className="font-semibold text-slate-900">{t.operations}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {insightBalance < 0
                      ? t.operationsNegative(formatKr(Math.abs(insightBalance)))
                      : t.operationsPositive(formatKr(insightBalance))}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    pensionIncomeWithoutPeriod > 0 ||
                    pensionIncomeWithoutConfirmedPayer > 0
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                />
                <div>
                  <p className="font-semibold text-slate-900">{t.documentData}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {pensionIncomeWithoutPeriod > 0 ||
                    pensionIncomeWithoutConfirmedPayer > 0
                      ? t.pensionNeedsConfirmation(pensionIncomeWithoutPeriod + pensionIncomeWithoutConfirmedPayer)
                      : hasInsightData
                        ? t.noUnconfirmedPension
                        : t.insightsBuilding}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50/60 p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    activeProcessingJobs > 0 ? "bg-sky-500" : "bg-emerald-500"
                  }`}
                />
                <div>
                  <p className="font-semibold text-slate-900">{t.processing}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {activeProcessingJobs > 0
                      ? t.processingActive(activeProcessingJobs)
                      : t.processingIdle}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="utgjold-greining" className="mt-6 scroll-mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {t.expenses}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">{t.outgoing}</h2>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {formatKr(insightExpenses)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {t.confirmedExpensesDescription}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
              <p className="text-xs text-slate-500">{t.bookedExpenses}</p>
              <p className="mt-1 font-bold text-slate-900">{formatKr(expenses)}</p>
            </div>
          </div>

          <details className="mt-5 rounded-xl border">
            <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-700">
              {t.detailed}
            </summary>
            <div className="space-y-3 border-t p-4 text-sm">
              {householdPropertyGroups.length > 0 && (
                <details className="overflow-hidden rounded-lg border bg-slate-50/70">
                  <summary className="cursor-pointer list-none p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {t.homeCost}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t.propertyData}
                        </p>
                      </div>
                      <span className="shrink-0 font-bold text-slate-950">
                        {formatKr(householdSourceDataTotal)}
                      </span>
                    </div>
                  </summary>

                  <div className="space-y-3 border-t bg-white p-3">
                    <p className="text-xs leading-5 text-slate-500">
                      {interfaceLanguage === "en" ? "GLÖGGT identified this information from source documents. It is shown for information and does not change booked expenses until an entry has been booked." : interfaceLanguage === "pl" ? "GLÖGGT rozpoznał te dane w dokumentach źródłowych. Są one prezentowane informacyjnie i nie zmieniają zaksięgowanych wydatków do czasu zaksięgowania zapisu." : interfaceLanguage === "sr" ? "GLÖGGT је препознао ове податке из изворних докумената. Приказани су информативно и не мењају прокњижене расходе док се ставка не прокњижи." : "GLÖGGT hefur greint þessi gögn úr frumgögnum. Þau eru sýnd til upplýsingar og breyta ekki bókuðum útgjöldum fyrr en bókun liggur fyrir."}
                    </p>

                    {householdPropertyGroups.map((property) => (
                      <div
                        key={property.name}
                        className="rounded-lg bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {property.name}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {[
                                property.insurance ? "Tryggingar" : null,
                                property.assessments.length > 0
                                  ? "Fasteignagjöld"
                                  : null,
                                property.utilities.length > 0
                                  ? "Veitur"
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold text-slate-900">
                            {formatKr(
                              (property.insurance?.amount ?? 0) +
                                property.assessments.reduce(
                                  (sum, assessment) =>
                                    sum + assessment.amount,
                                  0
                                ) +
                                property.utilities.reduce(
                                  (sum, utility) =>
                                    sum + utility.amount,
                                  0
                                )
                            )}
                          </span>
                        </div>

                        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                          {property.insurance && (
                            <details className="rounded-md bg-white">
                              <summary className="cursor-pointer list-none px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className="font-medium text-slate-800">
                                      Tryggingar
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {property.insurance.policies.length} skírteini
                                    </p>
                                  </div>
                                  <span className="font-semibold text-slate-900">
                                    {formatKr(property.insurance.amount)}
                                  </span>
                                </div>
                              </summary>

                              <div className="space-y-2 border-t border-slate-100 p-2">
                                {property.insurance.policies.map((policy) => (
                                  <div
                                    key={policy.label}
                                    className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                                  >
                                    <div>
                                      <p className="font-medium text-slate-800">
                                        {policy.insuranceType ?? "Trygging"}
                                      </p>
                                      {policy.policyNumber && (
                                        <p className="mt-0.5 text-xs text-slate-400">
                                          Skírteini {policy.policyNumber}
                                        </p>
                                      )}
                                      {(policy.periodStart || policy.periodEnd) && (
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          {formatDate(policy.periodStart)} –{" "}
                                          {formatDate(policy.periodEnd)}
                                        </p>
                                      )}
                                    </div>
                                    <span className="shrink-0 font-semibold text-slate-900">
                                      {formatKr(policy.amount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}

                          {property.assessments.map((assessment) => {
                            const assessmentYear =
                              assessment.periodStart?.getFullYear() ??
                              assessment.periodEnd?.getFullYear() ??
                              null;

                            return (
                              <details
                                key={assessment.id}
                                className="rounded-md bg-white"
                              >
                                <summary className="cursor-pointer list-none px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="font-medium text-slate-800">
                                        Fasteignagjöld
                                        {assessmentYear
                                          ? ` ${assessmentYear}`
                                          : ""}
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        Álögð gjöld · ekki staðfest greiðsla
                                      </p>
                                    </div>
                                    <span className="font-semibold text-slate-900">
                                      {formatKr(assessment.amount)}
                                    </span>
                                  </div>
                                </summary>

                                <div className="space-y-2 border-t border-slate-100 p-2">
                                  {assessment.details.map((detail) => (
                                    <div
                                      key={detail.id}
                                      className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                                    >
                                      <span className="text-slate-700">
                                        {detail.label}
                                      </span>
                                      <span className="shrink-0 font-semibold text-slate-900">
                                        {formatKr(detail.amount)}
                                      </span>
                                    </div>
                                  ))}

                                  {assessment.receiptId !== null && (
                                    <div className="flex justify-end px-1 pt-1">
                                      <a
                                        href={`/fylgiskjol/${assessment.receiptId}`}
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-950"
                                      >
                                        {t.actionOpen}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </details>
                            );
                          })}

                          {property.utilities.map((utility) => {
                            const utilityPeriod =
                              utility.periodStart ||
                              utility.periodEnd
                                ? formatYearMonth(
                                    yearMonthFromDate(
                                      utility.periodStart ??
                                        utility.periodEnd
                                    )
                                  )
                                : null;

                            return (
                              <details
                                key={utility.id}
                                className="rounded-md bg-white"
                              >
                                <summary className="cursor-pointer list-none px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="font-medium text-slate-800">
                                        Veitur
                                        {utilityPeriod
                                          ? ` · ${utilityPeriod}`
                                          : ""}
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        {t.sourceInvoiceUnconfirmed}
                                      </p>
                                    </div>
                                    <span className="font-semibold text-slate-900">
                                      {formatKr(utility.amount)}
                                    </span>
                                  </div>
                                </summary>

                                <div className="space-y-2 border-t border-slate-100 p-2">
                                  {utility.details.map((detail) => (
                                    <div
                                      key={detail.id}
                                      className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                                    >
                                      <span className="text-slate-700">
                                        {detail.label}
                                      </span>
                                      <span className="shrink-0 font-semibold text-slate-900">
                                        {formatKr(detail.amount)}
                                      </span>
                                    </div>
                                  ))}

                                  {utility.receiptId !== null && (
                                    <div className="flex justify-end px-1 pt-1">
                                      <a
                                        href={`/fylgiskjol/${utility.receiptId}`}
                                        className="text-xs font-semibold text-slate-600 hover:text-slate-950"
                                      >
                                        {t.actionOpen}
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {expenseInsightGroups.length > 0 ? (
                <div className="space-y-3">
                  {expenseInsightGroups.map((group) => (
                    <details key={group.category === "Fjármögnun og lán" ? (interfaceLanguage === "en" ? "Financing and loans" : interfaceLanguage === "pl" ? "Finansowanie i pożyczki" : interfaceLanguage === "sr" ? "Финансирање и кредити" : group.category) : group.category === "Bifreiðar" ? (interfaceLanguage === "en" ? "Vehicles" : interfaceLanguage === "pl" ? "Pojazdy" : interfaceLanguage === "sr" ? "Возила" : group.category) : group.category === "Banki og þjónustugjöld" ? (interfaceLanguage === "en" ? "Bank and service fees" : interfaceLanguage === "pl" ? "Bank i opłaty za usługi" : interfaceLanguage === "sr" ? "Банка и услужне накнаде" : group.category) : group.category === "Önnur útgjöld" ? (interfaceLanguage === "en" ? "Other expenses" : interfaceLanguage === "pl" ? "Pozostałe wydatki" : interfaceLanguage === "sr" ? "Остали расходи" : group.category) : group.category} className="overflow-hidden rounded-lg border bg-slate-50/70">
                      <summary className="cursor-pointer list-none p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">
                              {group.category === "Fjármögnun og lán" ? (interfaceLanguage === "en" ? "Financing and loans" : interfaceLanguage === "pl" ? "Finansowanie i pożyczki" : interfaceLanguage === "sr" ? "Финансирање и кредити" : group.category) : group.category === "Bifreiðar" ? (interfaceLanguage === "en" ? "Vehicles" : interfaceLanguage === "pl" ? "Pojazdy" : interfaceLanguage === "sr" ? "Возила" : group.category) : group.category === "Banki og þjónustugjöld" ? (interfaceLanguage === "en" ? "Bank and service fees" : interfaceLanguage === "pl" ? "Bank i opłaty za usługi" : interfaceLanguage === "sr" ? "Банка и услужне накнаде" : group.category) : group.category === "Önnur útgjöld" ? (interfaceLanguage === "en" ? "Other expenses" : interfaceLanguage === "pl" ? "Pozostałe wydatki" : interfaceLanguage === "sr" ? "Остали расходи" : group.category) : group.category}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {group.items.length} {interfaceLanguage === "en" ? (group.items.length === 1 ? "accounting item" : "accounting items") : interfaceLanguage === "pl" ? (group.items.length === 1 ? "pozycja księgowa" : "pozycje księgowe") : interfaceLanguage === "sr" ? (group.items.length === 1 ? "књиговодствена ставка" : "књиговодствене ставке") : (group.items.length === 1 ? "bókhaldsliður" : "bókhaldsliðir")}
                            </p>
                          </div>
                          <span className="shrink-0 font-bold text-slate-950">
                            {formatKr(group.amount)}
                          </span>
                        </div>
                      </summary>

                      <div className="space-y-2 border-t bg-white p-3">
                        {group.category === "Fjármögnun og lán" && knownLoans.length > 0 && (
                          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                              {t.loansKnown}
                            </p>
                            <div className="mt-2 space-y-2">
                              {knownLoans.map((loan) => (
                                <div
                                  key={loan.id}
                                  className="flex flex-wrap items-start justify-between gap-2 rounded-md bg-white px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800">
                                      {loan.name}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {loan.confirmedLiabilityAccounts.map((account) =>
                                        `${account.number} – ${account.name}`
                                      ).join(" · ")}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-xs font-medium text-emerald-700">
                                    {t.confirmedLink}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-500">
                              {interfaceLanguage === "en" ? "This loan link is knowledge from documents and confirmations. It does not change booked expenses until an entry is booked." : interfaceLanguage === "pl" ? "To powiązanie pożyczki wynika z dokumentów i potwierdzeń. Nie zmienia zaksięgowanych wydatków do czasu zaksięgowania zapisu." : interfaceLanguage === "sr" ? "Ова веза кредита је знање из докумената и потврда. Не мења прокњижене расходе док се ставка не прокњижи." : "Þessi lánatenging er þekking úr skjölum og staðfestingum. Hún breytir ekki bókuðum útgjöldum fyrr en færsla er bókuð."}
                            </p>
                          </div>
                        )}

                        {group.items.map((item) => {
                          const sources = expenseReceiptSources(item);

                          return (
                            <div
                              key={item.account}
                              className="rounded-lg bg-slate-50 p-3"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-800">
                                    {item.name}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {interfaceLanguage === "en" ? "Account" : interfaceLanguage === "pl" ? "Konto" : interfaceLanguage === "sr" ? "Конто" : "Reikningur"} {item.account}
                                  </p>

                                  {group.category === "Fjármögnun og lán" && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.linkedEntities.length === 1
                                        ? `${interfaceLanguage === "en" ? "Loan" : interfaceLanguage === "pl" ? "Pożyczka" : interfaceLanguage === "sr" ? "Кредит" : "Lán"}: ${item.linkedEntities[0]}`
                                        : item.linkedEntities.length > 1
                                          ? `${interfaceLanguage === "en" ? "Possible loans" : interfaceLanguage === "pl" ? "Możliwe pożyczki" : interfaceLanguage === "sr" ? "Могући кредити" : "Möguleg lán"}: ${item.linkedEntities.join(" · ")}`
                                          : (interfaceLanguage === "en" ? "Not linked to a specific loan" : interfaceLanguage === "pl" ? "Niepowiązane z konkretną pożyczką" : interfaceLanguage === "sr" ? "Није повезано са одређеним кредитом" : "Ekki tengt við ákveðið lán")}
                                    </p>
                                  )}

                                  {group.category === "Bifreiðar" && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {item.linkedEntities.length === 1
                                        ? `${interfaceLanguage === "en" ? "Vehicle" : interfaceLanguage === "pl" ? "Pojazd" : interfaceLanguage === "sr" ? "Возило" : "Bifreið"}: ${item.linkedEntities[0]}`
                                        : item.linkedEntities.length > 1
                                          ? `${interfaceLanguage === "en" ? "Possible vehicles" : interfaceLanguage === "pl" ? "Możliwe pojazdy" : interfaceLanguage === "sr" ? "Могућа возила" : "Mögulegar bifreiðar"}: ${item.linkedEntities.join(" · ")}`
                                          : (interfaceLanguage === "en" ? "Not linked to a specific vehicle" : interfaceLanguage === "pl" ? "Niepowiązane z konkretnym pojazdem" : interfaceLanguage === "sr" ? "Није повезано са одређеним возилом" : "Ekki tengt við ákveðna bifreið")}
                                    </p>
                                  )}
                                </div>

                                <span className="shrink-0 font-semibold text-slate-900">
                                  {formatKr(item.amount)}
                                </span>
                              </div>

                              {sources.length > 0 && (
                                <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                    {interfaceLanguage === "en" ? "Booked from source document" : interfaceLanguage === "pl" ? "Zaksięgowano z dokumentu źródłowego" : interfaceLanguage === "sr" ? "Прокњижено из изворног документа" : "Bókað úr fylgiskjali"}
                                  </p>

                                  {sources.map((source) => (
                                    <div
                                      key={source.id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-medium text-slate-700">
                                          {source.label}
                                        </p>
                                        <p className="mt-0.5 text-xs text-slate-500">
                                          {formatDate(source.date)} · {t.voucher} #{source.id}
                                        </p>
                                      </div>

                                      <div className="flex shrink-0 items-center gap-3">
                                        <span className="text-xs font-semibold text-slate-700">
                                          {formatKr(source.amount)}
                                        </span>
                                        <a
                                          href={`/fylgiskjol/${source.id}`}
                                          className="text-xs font-semibold text-slate-600 hover:text-slate-950"
                                        >
                                          {t.actionOpen}
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
                  {t.noBooked}
                </div>
              )}

              <div className="flex items-center justify-between gap-4 border-t pt-3">
                <span className="font-semibold text-slate-700">{t.totalBooked}</span>
                <span className="font-bold text-slate-950">{formatKr(expenses)}</span>
              </div>

              <p className="text-xs leading-5 text-slate-500">
                {interfaceLanguage === "en" ? "These categories are an Insights presentation layer on top of the accounting records. Accounts and booked entries remain unchanged. GLÖGGT only shows a specific loan or vehicle when the link is found in the same source document; otherwise the link remains unconfirmed." : interfaceLanguage === "pl" ? "Te kategorie są warstwą prezentacyjną Analiz nad księgowością. Konta i zaksięgowane zapisy pozostają bez zmian. GLÖGGT pokazuje konkretną pożyczkę lub pojazd tylko wtedy, gdy powiązanie znajduje się w tym samym dokumencie źródłowym; w przeciwnym razie pozostaje ono niepotwierdzone." : interfaceLanguage === "sr" ? "Ове категорије су приказни слој Увида изнад књиговодства. Конта и прокњижене ставке остају непромењени. GLÖGGT приказује одређени кредит или возило само када је веза пронађена у истом изворном документу; у супротном веза остаје непотврђена." : "Flokkarnir hér eru Innsýn-merking ofan á bókhaldið. Reikningslyklar og bókaðar færslur haldast óbreytt. GLÖGGT sýnir aðeins ákveðið lán eða bifreið þegar tengingin finnst í sama upprunaskjali; annars er tengingin skilin eftir óstaðfest."}
              </p>
            </div>
          </details>
        </section>

        {principalRepayments.length > 0 && (
          <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {interfaceLanguage === "en" ? "Liabilities and repayments" : interfaceLanguage === "pl" ? "Zobowiązania i spłaty" : interfaceLanguage === "sr" ? "Обавезе и отплате" : "Skuldir og afborganir"}
            </p>

            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  {t.principal}
                </h2>
                <p className="mt-2 text-3xl font-bold text-slate-950">
                  {formatKr(principalRepaymentTotal)}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {interfaceLanguage === "en" ? "Booked movements that reduce liabilities but are not operating expenses." : interfaceLanguage === "pl" ? "Zaksięgowane operacje zmniejszające zobowiązania, które nie są kosztami operacyjnymi." : interfaceLanguage === "sr" ? "Прокњижене промене које смањују обавезе, али нису пословни расход." : "Bókaðar hreyfingar sem lækka skuldir en teljast ekki til rekstrarútgjalda."}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
                <p className="text-xs text-slate-500">{t.expenseImpact}</p>
                <p className="mt-1 font-bold text-emerald-700">0 kr.</p>
              </div>
            </div>

            <details className="mt-5 rounded-xl border">
              <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-700">
                {t.installments}
              </summary>

              <div className="space-y-2 border-t p-4">
                {principalRepayments.map((item) => (
                  <div
                    key={`${item.receiptId}:${item.account}`}
                    className="rounded-lg bg-slate-50 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {item.sourceName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatDate(item.date)}
                          {item.loanNumber ? ` · ${t.loanShort} ${item.loanNumber}` : ""}
                          {" · "}
                          {item.account} – {item.accountName}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          {interfaceLanguage === "en" ? "Liability reduction · not an operating expense" : interfaceLanguage === "pl" ? "Zmniejszenie zobowiązania · nie jest kosztem operacyjnym" : interfaceLanguage === "sr" ? "Смањење обавезе · није пословни расход" : "Lækkun skuldar · ekki rekstrarútgjald"}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-semibold text-slate-900">
                          {formatKr(item.amount)}
                        </span>
                        <a
                          href={`/fylgiskjol/${item.receiptId}`}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-950"
                        >
                          {t.actionOpen}
                        </a>
                      </div>
                    </div>
                  </div>
                ))}

                <p className="pt-2 text-xs leading-5 text-slate-500">
                  {interfaceLanguage === "en" ? "A liability reduction changes the company balance sheet but is not an operating expense. Interest, indexation and fees continue to appear separately under expenses." : interfaceLanguage === "pl" ? "Zmniejszenie zobowiązania zmienia bilans firmy, ale nie jest kosztem operacyjnym. Odsetki, indeksacja i opłaty są nadal prezentowane osobno w kosztach." : interfaceLanguage === "sr" ? "Смањење обавезе мења биланс компаније, али није пословни расход. Камата, индексација и накнаде се и даље приказују посебно међу расходима." : "Lækkun skuldar breytir efnahag félagsins en er ekki rekstrarútgjald. Vextir, verðbætur og gjöld eru áfram sýnd sérstaklega undir útgjöldum."}
                </p>
              </div>
            </details>
          </section>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {pensionIncomeDocumentCount > 0 && (
            <section id="innkoma-greining" className="scroll-mt-6 rounded-2xl border bg-white p-5 shadow-sm md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t.incomeDocs}
              </p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">
                    {t.pension}
                  </h2>
                  <p className="mt-2 text-3xl font-bold text-slate-950">
                    {formatKr(pensionIncomeCurrentYear)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {interfaceLanguage === "en" ? `Analyzed total ${currentYear} · gross before withholding tax` : interfaceLanguage === "pl" ? `Łącznie przeanalizowano ${currentYear} · brutto przed podatkiem u źródła` : interfaceLanguage === "sr" ? `Укупно анализирано ${currentYear} · бруто пре пореза по одбитку` : `Greint samtals ${currentYear} · brúttó fyrir staðgreiðslu`}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
                  <p className="text-xs text-slate-500">{t.latestPeriod}</p>
                  <p className="mt-1 font-bold text-slate-900">
                    {latestPensionIncome
                      ? formatKr(latestPensionIncome.amount)
                      : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {latestPensionIncome
                      ? formatYearMonth(latestPensionIncome.period, interfaceLanguage)
                      : "Ekki greint"}
                  </p>
                </div>
              </div>

              <details className="mt-5 rounded-xl border">
                <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-700">
                  {t.detailed}
                </summary>
                <div className="border-t p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{t.analyzedPayments}</p>
                      <p className="mt-1 text-lg font-bold">{pensionIncomeDocumentCount}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">{t.needsConfirmation}</p>
                      <p className="mt-1 text-lg font-bold">
                        {pensionIncomeWithoutPeriod + pensionIncomeWithoutConfirmedPayer}
                      </p>
                    </div>
                  </div>

                  {pensionIncomeMonths.length > 0 && (
                    <div className="mt-4 divide-y rounded-lg border">
                      {pensionIncomeMonths.slice(0, 12).map((item) => (
                        <div key={item.period} className="px-4 py-3 text-sm">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-medium text-slate-700">
                              {formatYearMonth(item.period, interfaceLanguage)}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {formatKr(item.amount)}
                            </span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {item.payers.map((payer) => (
                              <div
                                key={`${item.period}:${payer.name}`}
                                className="flex items-center justify-between gap-4 text-xs"
                              >
                                <span
                                  className={
                                    payer.name === "Óstaðfestur greiðandi"
                                      ? "text-amber-700"
                                      : "text-slate-500"
                                  }
                                >
                                  {payer.name === "Óstaðfestur greiðandi" ? innsynUnconfirmedPayer(interfaceLanguage) : payer.name}
                                </span>
                                <span className="font-medium text-slate-600">
                                  {formatKr(payer.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </section>
          )}

          {latestInsurance && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {t.assetsRisk}
              </p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-950">{t.insurance}</h2>
                  <p className="mt-2 text-3xl font-bold text-slate-950">
  {innsynInsuranceCount(insurancePolicies.length, interfaceLanguage)}
</p>

<p className="mt-1 text-sm text-slate-500">
  {interfaceLanguage === "en" ? "Net premium movements in the overview" : interfaceLanguage === "pl" ? "Zmiany netto składek w zestawieniu" : interfaceLanguage === "sr" ? "Нето кретање премија у прегледу" : "Nettó iðgjaldahreyfingar á yfirliti"}{" "}
  <span className="font-semibold text-slate-700">
    {formatKr(insurancePremiumNetTotal)}
  </span>
</p>
                </div>
                <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                  {formatDate(latestInsurance.latestCreatedAt)}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{t.insurance}</p>
                  <p className="mt-1 text-lg font-bold">
  {insurancePolicies.length}
</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{t.vehicles}</p>
                  <p className="mt-1 text-lg font-bold">{insuranceVehicles.length}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{t.properties}</p>
                  <p className="mt-1 text-lg font-bold">{insuranceProperties.length}</p>
                </div>
              </div>

              <details className="mt-5 rounded-xl border">
                <summary className="cursor-pointer p-4 text-sm font-semibold text-slate-700">
                  {t.detailed}
                </summary>
                <div className="space-y-4 border-t p-4 text-sm">
                  
                  {highestCoverage !== null && (
                    <div className="flex justify-between gap-4 border-b pb-3">
                      <span className="text-slate-500">{t.highestCoverage}</span>
                      <span className="font-semibold">{formatKr(highestCoverage)}</span>
                    </div>
                  )}
                  {possibleRefund !== null && (
                    <div className="flex justify-between gap-4 border-b pb-3">
                      <span className="text-slate-500">{t.possibleRefund}</span>
                      <span className="font-semibold">{formatKr(possibleRefund)}</span>
                    </div>
                  )}
                  {conditionalAnnualPremium !== null && (
                    <div className="flex justify-between gap-4 border-b pb-3">
                      <span className="text-slate-500">{t.possibleCost}</span>
                      <span className="font-semibold">{formatKr(conditionalAnnualPremium)}</span>
                    </div>
                  )}
                  {(lowestDeductible !== null || highestDeductible !== null) && (
                    <div className="flex justify-between gap-4 border-b pb-3">
                      <span className="text-slate-500">{t.deductible}</span>
                      <span className="text-right font-semibold">
                        {lowestDeductible !== null ? formatKr(lowestDeductible) : "—"}
                        {highestDeductible !== null && highestDeductible !== lowestDeductible
                          ? ` – ${formatKr(highestDeductible)}`
                          : ""}
                      </span>
                    </div>
                  )}

                  {(insuranceVehicles.length > 0 || insuranceProperties.length > 0) && (
                    <div>
                      <p className="font-semibold text-slate-900">{t.insured}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[...insuranceVehicles, ...insuranceProperties].map((entity) => (
                          <span
                            key={entity.id}
                            className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700"
                          >
                            {entity.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {insurancePolicies.length > 0 && (
  <div>
    <p className="font-semibold text-slate-900">
      Tryggingar eftir eignum
    </p>

    <div className="mt-3 space-y-3">
      {insuranceAssetGroups.map((asset) => (
  <div
    key={asset.insuredItem}
    className="rounded-lg border bg-white p-3"
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-semibold text-slate-900">
          {asset.insuredItem}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          {asset.policies.length} skírteini
        </p>
      </div>

      <p className="font-bold text-slate-950">
        {formatKr(asset.amount)}
      </p>
    </div>

    <div className="mt-3 divide-y border-t">
      {asset.policies.map((policy) => (
        <div
          key={policy.label}
          className="flex flex-wrap items-start justify-between gap-3 py-3"
        >
          <div>
            <p className="font-medium text-slate-800">
              {policy.insuranceType ?? "Trygging"}
            </p>

            {policy.policyNumber && (
              <p className="mt-1 text-xs text-slate-400">
                Skírteini {policy.policyNumber}
              </p>
            )}

            {(policy.periodStart || policy.periodEnd) && (
              <p className="mt-1 text-xs text-slate-500">
                {formatDate(policy.periodStart)} –{" "}
                {formatDate(policy.periodEnd)}
              </p>
            )}
          </div>

          <p className="font-semibold text-slate-900">
            {formatKr(policy.amount)}
          </p>
        </div>
      ))}
    </div>
  </div>
))}
    </div>
  </div>
)}

                  <details className="rounded-lg bg-slate-50">
                    <summary className="cursor-pointer p-3 font-medium text-slate-700">
                      {t.showAllInsurance}
                    </summary>
                    <div className="divide-y border-t">
                      {insuranceFactsForDisplay.map((fact) => (
                        <div
                          key={fact.id}
                          className="flex items-start justify-between gap-4 p-3"
                        >
                          <span className="text-slate-600">
                            {fact.label ? innsynFactLabel(fact.label, interfaceLanguage) : humanizeCode(fact.factType, interfaceLanguage)}
                          </span>
                          <span className="text-right font-medium text-slate-900">
                            {formatFactValue(fact, interfaceLanguage)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </details>
            </section>
          )}
        </div>

        {!hasInsightData ? (
          <section className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-slate-950">{t.building}</h2>
            <p className="mt-2 max-w-2xl text-slate-600">
              {t.noInsightData}
            </p>
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border bg-white shadow-sm">
            <details>
              <summary className="cursor-pointer p-5 md:p-6">
                <span className="text-lg font-bold text-slate-950">{t.further}</span>
                <span className="ml-3 text-sm font-normal text-slate-500">
                  {entityCount} {t.entitiesWord} · {factCount} {t.factsWord} · {financialEvents.length} {t.recentEventsWord}
                </span>
              </summary>

              <div className="space-y-6 border-t p-5 md:p-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{t.docsContain}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {detectedAreas.map(([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full border bg-slate-50 px-3 py-2 text-sm text-slate-700"
                        >
                          {humanizeCode(type, interfaceLanguage)} <span className="font-semibold">{count}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-slate-900">{t.latestFacts}</h3>
                    <div className="mt-3 space-y-3">
                      {importantFacts.map((fact) => (
                        <div key={fact.id} className="flex items-start justify-between gap-4">
                          <span className="text-sm text-slate-600">
                            {fact.label ? innsynFactLabel(fact.label, interfaceLanguage) : humanizeCode(fact.factType, interfaceLanguage)}
                          </span>
                          <span className="text-right text-sm font-semibold text-slate-900">
                            {formatFactValue(fact, interfaceLanguage)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <details className="rounded-xl border">
                  <summary className="cursor-pointer p-4 font-semibold text-slate-800">
                    {t.knownItems} ({entityCount})
                  </summary>
                  <div className="grid gap-3 border-t p-4 lg:grid-cols-2">
                    {entities.map((entity) => (
                      <div key={entity.id} className="rounded-lg bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{entity.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {humanizeCode(entity.entityType, interfaceLanguage)}
                            </p>
                          </div>
                          {entity.relationshipStatus && (
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                              {humanizeCode(entity.relationshipStatus, interfaceLanguage)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="rounded-xl border">
                  <summary className="cursor-pointer p-4 font-semibold text-slate-800">
                    {t.moreFacts} ({factCount})
                  </summary>
                  <div className="divide-y border-t">
                    {facts.map((fact) => (
                      <div key={fact.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">
                              {fact.label ? innsynFactLabel(fact.label, interfaceLanguage) : humanizeCode(fact.factType, interfaceLanguage)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {t.source}: {humanizeCode(fact.source, interfaceLanguage)}
                              {fact.confidence !== null
                                ? ` · ${t.confidence} ${Math.round(fact.confidence * 100)}%`
                                : ""}
                            </p>
                          </div>
                          <p className="font-semibold text-slate-900">{formatFactValue(fact, interfaceLanguage)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="rounded-xl border">
                  <summary className="cursor-pointer p-4 font-semibold text-slate-800">
                    {t.financialEvents} ({financialEvents.length})
                  </summary>
                  <div className="overflow-x-auto border-t">
                    {financialEvents.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">{t.noEvents}</p>
                    ) : (
                      <table className="w-full text-left text-sm">
                        <thead className="border-b bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-4 py-3 font-medium">{t.date}</th>
                            <th className="px-4 py-3 font-medium">{t.event}</th>
                            <th className="px-4 py-3 font-medium">{t.status}</th>
                            <th className="px-4 py-3 text-right font-medium">{t.amount}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {financialEvents.map((event) => (
                            <tr key={event.id}>
                              <td className="px-4 py-3 text-slate-500">{formatDate(event.eventDate)}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {event.title || humanizeCode(event.eventType, interfaceLanguage)}
                              </td>
                              <td className="px-4 py-3 text-slate-600">{humanizeCode(event.status, interfaceLanguage)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-900">
                                {event.amount !== null
                                  ? event.currency === "ISK"
                                    ? formatKr(Number(event.amount))
                                    : `${formatNumber(Number(event.amount), {
                                        maximumFractionDigits: 2,
                                      })} ${event.currency}`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </details>

                <details className="rounded-xl border">
                  <summary className="cursor-pointer p-4 font-semibold text-slate-800">
                    {t.processing}
                    {activeProcessingJobs > 0 ? ` · ${activeProcessingJobs} ${t.inProgress}` : ""}
                  </summary>
                  <div className="divide-y border-t">
                    {processingJobs.length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">{t.noProcessing}</p>
                    ) : (
                      processingJobs.map((job) => (
                        <div key={job.id} className="p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <span className="font-semibold text-slate-900">Innsýn #{job.id}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                              {humanizeCode(job.status, interfaceLanguage)}
                            </span>
                          </div>
                          <p className="mt-2 text-slate-500">
                            {interfaceLanguage === "en" ? "Completed" : interfaceLanguage === "pl" ? "Ukończono" : interfaceLanguage === "sr" ? "Завршено" : "Lokið"} {job.completedItems} {interfaceLanguage === "en" ? "of" : interfaceLanguage === "pl" ? "z" : interfaceLanguage === "sr" ? "од" : "af"} {job.totalItems}
                            {job.failedItems > 0 ? ` · ${interfaceLanguage === "en" ? "Failed" : interfaceLanguage === "pl" ? "Niepowodzenie" : interfaceLanguage === "sr" ? "Неуспело" : "Mistókst"} ${job.failedItems}` : ""}
                            {job.processingItems > 0 ? ` · ${interfaceLanguage === "en" ? "Processing" : interfaceLanguage === "pl" ? "W trakcie" : interfaceLanguage === "sr" ? "У обради" : "Í vinnslu"} ${job.processingItems}` : ""}
                            {job.pendingItems > 0 ? ` · ${interfaceLanguage === "en" ? "Pending" : interfaceLanguage === "pl" ? "Oczekuje" : interfaceLanguage === "sr" ? "На чекању" : "Bíður"} ${job.pendingItems}` : ""}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </details>
              </div>
            </details>
          </section>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          {interfaceLanguage === "en" ? "Insights show the position based on data GLÖGGT has already received and processed." : interfaceLanguage === "pl" ? "Analizy pokazują stan na podstawie danych, które GLÖGGT już otrzymał i przetworzył." : interfaceLanguage === "sr" ? "Увид приказује стање на основу података које је GLÖGGT већ примио и обрадио." : "Innsýn sýnir stöðu út frá þeim gögnum sem GLÖGGT hefur þegar fengið og unnið."}
        </p>
      </div>
    </div>
  );
}
