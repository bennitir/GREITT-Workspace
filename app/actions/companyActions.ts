"use server";

import OpenAI from "openai";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { defaultAccounts } from "@/app/data/accounts";
import {
  getEffectiveUser,
  requireCompanyWriteAccess,
} from "@/lib/core/access-control";

type SkatturinnActivityCode = {
  Type?: string | null;
  CodeSystem?: string | null;
  Id?: string | null;
  Name?: string | null;
};

type SkatturinnVat = {
  VatNumber?: string | null;
  Registered?: string | null;
  DeRegistered?: string | null;
  ActivityCode?: SkatturinnActivityCode | null;
};

type SkatturinnLegalEntity = {
  NationalId?: string | null;
  Name?: string | null;
  PurposeOfEntity?: string | null;
  Status?: string | null;
  ActivityCode?: SkatturinnActivityCode[] | null;
  Vat?: SkatturinnVat[] | null;
};

function normalizeNationalId(value: string) {
  return value.replace(/\D/g, "");
}


export type CompanyAccountSuggestion = {
  number: string;
  name: string;
  type: string;
  entryRole: string | null;
  reason: string;
  vatRecommendation: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

export type CompanyAccountSuggestionState = {
  status: "IDLE" | "SUCCESS" | "ERROR";
  message: string;
  summary: string;
  activeActivities: string[];
  suggestions: CompanyAccountSuggestion[];
};

export async function suggestCompanyAccountsWithAI(
  previousState: CompanyAccountSuggestionState,
  formData: FormData
): Promise<CompanyAccountSuggestionState> {
  void previousState;

  const activeUser = await requireEffectiveAdmin();

  const companyId = Number(formData.get("companyId"));

  if (!Number.isInteger(companyId)) {
    return {
      status: "ERROR",
      message: "Ógilt fyrirtæki.",
      summary: "",
      activeActivities: [],
      suggestions: [],
    };
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    include: {
      accounts: {
        where: {
          isActive: true,
        },
        orderBy: {
          number: "asc",
        },
      },
      activities: {
        orderBy: [
          {
            code: "asc",
          },
          {
            id: "asc",
          },
        ],
      },
    },
  });

  if (!company) {
    return {
      status: "ERROR",
      message: "Fyrirtækið fannst ekki.",
      summary: "",
      activeActivities: [],
      suggestions: [],
    };
  }

  if (!company.isActive) {
    return {
      status: "ERROR",
      message: "Ekki er hægt að gera tillögu fyrir lokað fyrirtæki.",
      summary: "",
      activeActivities: [],
      suggestions: [],
    };
  }

  const activeActivities = company.activities.filter(
    (activity) => activity.isActive
  );

  // RSK-kóðinn 99.99.9 merkir óþekkta/óflokkaða starfsemi og er
  // ekki nægileg bókhaldsleg forsenda fyrir AI-tillögu. Við varðveitum
  // hann sem RSK-upplýsingu en látum hann ekki stýra reikningslyklum.
  const aiEligibleActiveActivities = activeActivities.filter(
    (activity) => activity.code?.trim() !== "99.99.9"
  );

  if (aiEligibleActiveActivities.length === 0) {
    return {
      status: "ERROR",
      message:
        activeActivities.length > 0
          ? "Virk starfsemi er aðeins skráð sem 99.99.9 – Óþekkt starfsemi. Skráðu eða staðfestu raunverulega virka starfsemi áður en AI leggur til reikningslykla."
          : "Engin virk starfsemi hefur verið staðfest. Staðfestu virka starfsemi fyrst.",
      summary: "",
      activeActivities: [],
      suggestions: [],
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      status: "ERROR",
      message: "OPENAI_API_KEY vantar á server.",
      summary: "",
      activeActivities: [],
      suggestions: [],
    };
  }

  const openai = new OpenAI({
    apiKey,
    timeout: 60 * 1000,
    maxRetries: 0,
  });

  const activeActivityLabels = aiEligibleActiveActivities.map((activity) =>
    activity.code
      ? `${activity.code} – ${activity.name}`
      : activity.name
  );

  const inactiveRskActivityLabels = company.activities
    .filter(
      (activity) =>
        activity.registeredAtRsk &&
        (!activity.isActive ||
          activity.code?.trim() === "99.99.9")
    )
    .map((activity) =>
      activity.code
        ? `${activity.code} – ${activity.name}`
        : activity.name
    );

  const existingAccountNumbers = new Set(
    company.accounts.map((account) => account.number)
  );

  const existingAccountsText =
    company.accounts.length > 0
      ? company.accounts
          .map((account) =>
            [
              account.number,
              account.name,
              `type=${account.type}`,
              account.entryRole
                ? `entryRole=${account.entryRole}`
                : null,
              account.vatTreatment
                ? `vatTreatment=${account.vatTreatment}`
                : null,
              account.vatRate != null
                ? `vatRate=${account.vatRate}`
                : null,
              account.vatAccount
                ? `vatAccount=${account.vatAccount}`
                : null,
              account.vatRequiresConfirmation
                ? "vatRequiresConfirmation=true"
                : null,
            ]
              .filter(Boolean)
              .join(" | ")
          )
          .join("\n")
      : "Engir reikningslyklar skráðir.";

  const prompt = `
Þú ert aðstoðarkerfi fyrir íslenskt bókhald í GLÖGGT.

VERKEFNI:
Berðu saman staðfesta virka starfsemi fyrirtækisins við núverandi reikningslykil og leggðu aðeins til reikningslykla sem líklega vantar.

MIKILVÆGAR REGLUR:
- Þetta er aðeins tillaga. Ekki stofna, breyta eða eyða neinu.
- Virk starfsemi er eina starfsemisforsendan.
- ÍSAT 99.99.9 – Óþekkt starfsemi er aldrei gild forsenda fyrir AI-tillögu og má ekki nota til að álykta um eðli rekstrar.
- RSK-skráð en óvirk starfsemi má EKKI hafa áhrif á tillöguna.
- number er aðeins flokkunarvísbending frá AI, ekki endanlegt reikningsnúmer.
- Notaðu fjögurra stafa number sem sýnir hvaða reikningsröð/flokk tillagan tilheyrir.
- GLÖGGT mun sjálft úthluta endanlegu lausu reikningsnúmeri og má því breyta number eftir að svarið kemur frá AI.
- Vertu mjög íhaldssamur og leggðu aðeins til lykla sem leiða beint af staðfestri virkri starfsemi.
- Hver tillaga verður að vera rökstudd með tiltekinni virkri starfsemisgrein: hvaða starfsemi kallar á lykilinn og hvers vegna.
- Ekki nota þetta verkefni til að fylla almenn göt í reikningslyklinum.
- Ekki leggja til almenna rekstrarlykla eins og laun, húsaleigu, bankakostnað, skrifstofukostnað, tryggingar eða almennan kostnað eingöngu vegna þess að slíkir lyklar eru algengir hjá fyrirtækjum.
- Almennur lykill má aðeins koma sem tillaga ef sérstakt eðli virku starfseminnar gerir hann greinilega nauðsynlegan og ástæðan er skýr.
- Ekki leggja til sérlykil ef almennur núverandi lykill dugar vel.
- Tillagan á fyrst og fremst að finna starfsemissértæka tekju-, kostnaðar-, birgða-, tækja- eða aðra lykla sem núverandi reikningslykill nær ekki nægilega vel utan um.
- Ef þú getur ekki tengt tillögu beint við eina eða fleiri virkar starfsemisgreinar skaltu sleppa henni.
- VSK-frádráttur má aldrei vera sjálfgefinn aðeins vegna þess að fyrirtæki sé VSK-skráð.
- Þú mátt ekki ákveða eða festa VSK-prósentu, frádráttarrétt eða VSK-reikning sem bókhaldsreglu í þessari tillögu.
- vatRecommendation er aðeins varúðartexti til yfirferðar. Ef VSK gæti átt við skal segja að VSK-meðferð þurfi staðfestingu áður en lykill er stofnaður eða notaður með sjálfvirkri VSK-meðferð.
- Ekki fullyrða að tiltekin starfsemi beri ákveðið VSK-hlutfall nema það sé beinlínis staðfest í þeim gögnum sem þú færð. Í þessu verkefni eru slík gögn ekki gefin.
- Ef óvissa er um VSK skal velja varfærna framsetningu: "VSK-meðferð þarfnast staðfestingar."
- Tillögur eiga að vera íslenskar, stuttar og faglegar.
- "type" og "entryRole" eiga að samræmast eðli lykilsins eins og best verður á kosið út frá núverandi reikningslykli.
- Í reason verður að nefna þá virku starfsemisgrein sem tillagan byggir á og hvers vegna núverandi lyklar duga ekki.
- Það er betra að skila engri tillögu en veikri eða almennri tillögu.
- Ef enginn starfsemissértækur lykill vantar skaltu skila tómu suggestions fylki.

FYRIRTÆKI:
Nafn: ${company.name}
VSK-skráð: ${
    company.vatRegistered === true
      ? "Já"
      : company.vatRegistered === false
        ? "Nei"
        : "Ekki staðfest"
  }
VSK-númer: ${company.vatNumber || "Ekki skráð"}

VIRK STARFSEMI:
${activeActivityLabels.map((item) => `- ${item}`).join("\n")}

RSK-SKRÁÐ EN ÓVIRK STARFSEMI — MÁ EKKI NOTA SEM FORSENDU:
${
  inactiveRskActivityLabels.length > 0
    ? inactiveRskActivityLabels
        .map((item) => `- ${item}`)
        .join("\n")
    : "- Engin"
}

NÚVERANDI REIKNINGSLYKLAR:
${existingAccountsText}
`.trim();

  try {
    const response = await openai.responses.create({
      model: "gpt-5.6",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "company_account_suggestions",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [
              "summary",
              "suggestions",
            ],
            properties: {
              summary: {
                type: "string",
              },
              suggestions: {
                type: "array",
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "number",
                    "name",
                    "type",
                    "entryRole",
                    "reason",
                    "vatRecommendation",
                    "confidence",
                  ],
                  properties: {
                    number: {
                      type: "string",
                      pattern: "^[0-9]{4}$",
                    },
                    name: {
                      type: "string",
                    },
                    type: {
                      type: "string",
                    },
                    entryRole: {
                      anyOf: [
                        {
                          type: "string",
                        },
                        {
                          type: "null",
                        },
                      ],
                    },
                    reason: {
                      type: "string",
                    },
                    vatRecommendation: {
                      type: "string",
                    },
                    confidence: {
                      type: "string",
                      enum: [
                        "HIGH",
                        "MEDIUM",
                        "LOW",
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const parsed = JSON.parse(
      response.output_text
    ) as {
      summary: string;
      suggestions: CompanyAccountSuggestion[];
    };

    const reservedNumbers = new Set(
      existingAccountNumbers
    );

    function assignAccountNumber(
      suggestedNumber: string
    ) {
      if (!/^\d{4}$/.test(suggestedNumber)) {
        return null;
      }

      const numericSuggestion = Number(
        suggestedNumber
      );

      const groupStart =
        Math.floor(numericSuggestion / 100) * 100;
      const groupEnd = groupStart + 99;

      const preferredOffset =
        numericSuggestion % 10 === 0 ? 10 : 1;

      const candidates: number[] = [];

      for (
        let candidate = numericSuggestion;
        candidate <= groupEnd;
        candidate += preferredOffset
      ) {
        candidates.push(candidate);
      }

      for (
        let candidate = groupStart;
        candidate < numericSuggestion;
        candidate += preferredOffset
      ) {
        candidates.push(candidate);
      }

      for (const candidate of candidates) {
        const number = String(candidate).padStart(
          4,
          "0"
        );

        if (!reservedNumbers.has(number)) {
          reservedNumbers.add(number);
          return number;
        }
      }

      return null;
    }

    const suggestions = parsed.suggestions
      .map((suggestion) => {
        const assignedNumber =
          assignAccountNumber(
            suggestion.number
          );

        if (!assignedNumber) {
          return null;
        }

        return {
          ...suggestion,
          number: assignedNumber,
        };
      })
      .filter(
        (
          suggestion
        ): suggestion is CompanyAccountSuggestion =>
          suggestion !== null
      );

    await prisma.auditEvent.create({
      data: {
        companyId: company.id,
        userId: activeUser.id,
        entityType: "Company",
        entityId: company.id,
        action:
          "GENERATE_ACCOUNT_SUGGESTION",
        source: "AI",
        description:
          "AI-tillaga að reikningslyklum búin til út frá staðfestri virkri starfsemi.",
        afterData: {
          summary: parsed.summary,
          suggestions,
        },
        metadata: {
          activeActivities:
            activeActivityLabels,
          inactiveRskActivities:
            inactiveRskActivityLabels,
          existingAccountCount:
            company.accounts.length,
          suggestionCount:
            suggestions.length,
          accountNumbersAssignedBy:
            "GLOGGT",
          noAccountsChanged: true,
          vatTreatmentConfirmed: false,
          vatRequiresConfirmation: true,
        },
      },
    });

    return {
      status: "SUCCESS",
      message:
        suggestions.length > 0
          ? `AI lagði til ${suggestions.length} mögulega reikningslykla.`
          : "AI fann enga augljósa viðbót sem vantar.",
      summary: parsed.summary,
      activeActivities:
        activeActivityLabels,
      suggestions,
    };
  } catch (error) {
    console.error(
      "Villa við AI-tillögu að reikningslyklum:",
      error
    );

    return {
      status: "ERROR",
      message:
        "Ekki tókst að búa til AI-tillögu að reikningslyklum.",
      summary: "",
      activeActivities:
        activeActivityLabels,
      suggestions: [],
    };
  }
}

async function fetchCompanyRegistryData(
  nationalId: string
): Promise<SkatturinnLegalEntity> {
  const apiKey = process.env.SKATTURINN_API_KEY;

  if (!apiKey) {
    throw new Error(
      "SKATTURINN_API_KEY vantar í umhverfisstillingar GLÖGGT."
    );
  }

  const normalizedNationalId = normalizeNationalId(nationalId);

  if (normalizedNationalId.length !== 10) {
    throw new Error("Kennitala fyrirtækis er ekki á gildu 10 stafa formi.");
  }

  const response = await fetch(
    `https://api.skattur.cloud/legalentities/v2.1/${normalizedNationalId}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": apiKey,
      },
      cache: "no-store",
    }
  );

  if (response.status === 404) {
    throw new Error("Fyrirtækið fannst ekki í fyrirtækjaskrá Skattsins.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("Skatturinn hafnaði API-aðganginum. Athuga þarf API-lykil GLÖGGT.");
  }

  if (!response.ok) {
    throw new Error(
      `Ekki tókst að sækja fyrirtækjagögn frá Skattinum (${response.status}).`
    );
  }

  return (await response.json()) as SkatturinnLegalEntity;
}

async function requireEffectiveAdmin() {
  const user = await getEffectiveUser();

  if (!user || user.role !== "ADMIN") {
    throw new Error("Þú hefur ekki heimild til þessarar aðgerðar.");
  }

  return user;
}

async function requireCompanyReadAccess(
  companyId: number
) {
  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (user.role === "ADMIN") {
    return user;
  }

  const access = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId: user.id,
        companyId,
      },
    },
  });

  if (!access || !access.isActive) {
    throw new Error(
      "Þú hefur ekki aðgang að þessu fyrirtæki."
    );
  }

  return user;
}

async function saveRskCertificate(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "rsk-certificates"
  );

  await fs.mkdir(uploadDir, {
    recursive: true,
  });

  const safeName = file.name.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  const fileName = `${Date.now()}-${safeName}`;
  const fullPath = path.join(
    uploadDir,
    fileName
  );

  await fs.writeFile(
    fullPath,
    buffer
  );

  return `/uploads/rsk-certificates/${fileName}`;
}

export async function updateCompany(
  id: number,
  data: {
    name: string;
    kennitala?: string;
    address: string;
    phone: string;
    email: string;
    contact: string;

    vatNumber?: string | null;
vatRegistered?: boolean | null;
vatRegistrationDate?: Date | null;
vatSettlementType?: string | null;
vatDataSource?: string | null;
vatDataUpdatedAt?: Date | null;
vatConfirmedAt?: Date | null;
vatConfirmedBy?: string | null;

nextVoucherNumber?: number;

    rskRegisteredActivities?: string | null;
activeActivities?: string | null;
rskCertificatePath?: string | null;
rskDataUpdatedAt?: Date | null;
activitiesConfirmedAt?: Date | null;
activitiesConfirmedBy?: string | null;

activities?: {
  id: number | null;
  code: string;
  name: string;
  registeredAtRsk: boolean;
  isActive: boolean;
}[];
  }
) {
  await requireEffectiveAdmin();

  const currentCompany =
    await prisma.company.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            receipts: true,
            accounts: true,
          },
        },
      },
    });

  if (!currentCompany) {
    throw new Error(
      "Fyrirtæki fannst ekki."
    );
  }

  const hasAccountingData =
    currentCompany._count.receipts > 0 ||
    currentCompany._count.accounts > 0;

  const normalizeKennitala = (
    value: string
  ) => value.replace(/\D/g, "");

  const kennitalaChanged =
    data.kennitala &&
    normalizeKennitala(
      data.kennitala
    ) !==
      normalizeKennitala(
        currentCompany.kennitala
      );

  if (
    hasAccountingData &&
    kennitalaChanged
  ) {
    throw new Error(
      "Ekki er hægt að breyta kennitölu eftir að bókhaldsgögn hafa verið skráð."
    );
  }

  const {
  activities,
  ...companyData
} = data;

await prisma.$transaction(async (tx) => {
  await tx.company.update({
    where: {
      id,
    },
    data: companyData,
  });

  if (activities) {
    const existingActivities =
      await tx.companyActivity.findMany({
        where: {
          companyId: id,
        },
        select: {
          id: true,
          code: true,
          name: true,
          registeredAtRsk: true,
          isActive: true,
          dataSource: true,
        },
      });

    const existingById = new Map(
      existingActivities.map((activity) => [
        activity.id,
        activity,
      ])
    );

    const submittedIds = activities
      .map((activity) => activity.id)
      .filter((activityId): activityId is number =>
        Number.isInteger(activityId)
      );

    const idsToDelete = existingActivities
      .filter(
        (activity) =>
          activity.dataSource !== "RSK" &&
          !submittedIds.includes(activity.id)
      )
      .map((activity) => activity.id);

    if (idsToDelete.length > 0) {
      await tx.companyActivity.deleteMany({
        where: {
          companyId: id,
          id: {
            in: idsToDelete,
          },
          NOT: {
            dataSource: "RSK",
          },
        },
      });
    }

    for (const activity of activities) {
      const code =
        activity.code.trim() || null;
      const name = activity.name.trim();

      if (!name) {
        continue;
      }

      if (activity.id) {
        const existing =
          existingById.get(activity.id);

        if (!existing) {
          continue;
        }

        if (existing.dataSource === "RSK") {
          await tx.companyActivity.updateMany({
            where: {
              id: activity.id,
              companyId: id,
              dataSource: "RSK",
            },
            data: {
              isActive: activity.isActive,
              dataUpdatedAt: new Date(),
            },
          });

          continue;
        }

        await tx.companyActivity.updateMany({
          where: {
            id: activity.id,
            companyId: id,
            NOT: {
              dataSource: "RSK",
            },
          },
          data: {
            code,
            name,
            registeredAtRsk: false,
            isActive: activity.isActive,
            dataUpdatedAt: new Date(),
          },
        });
      } else {
        await tx.companyActivity.create({
          data: {
            companyId: id,
            code,
            name,
            registeredAtRsk: false,
            isActive: activity.isActive,
            dataSource: "MANUAL",
            dataUpdatedAt: new Date(),
          },
        });
      }
    }
  }
});

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath(
    `/fyrirtaeki/${id}`
  );
  revalidatePath(
    `/fyrirtaeki/${id}/breyta`
  );
  
}

export async function syncCompanyRegistryFromSkatturinn(
  companyId: number
) {
  const user = await requireEffectiveAdmin();

  if (!Number.isInteger(companyId)) {
    throw new Error("Ógilt fyrirtæki.");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      kennitala: true,
      activities: {
        orderBy: [{ code: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!company) {
    throw new Error("Fyrirtæki fannst ekki.");
  }

  const rskData = await fetchCompanyRegistryData(company.kennitala);
  const responseNationalId = normalizeNationalId(rskData.NationalId ?? "");
  const companyNationalId = normalizeNationalId(company.kennitala);

  if (responseNationalId && responseNationalId !== companyNationalId) {
    throw new Error(
      "Kennitala í svari Skattsins passar ekki við fyrirtækið í GLÖGGT."
    );
  }

  const now = new Date();

  const registryActivities = (rskData.ActivityCode ?? [])
    .map((activity) => ({
      code: activity.Id?.trim() ?? "",
      name: activity.Name?.trim() ?? "",
      type: activity.Type?.trim() ?? null,
      codeSystem: activity.CodeSystem?.trim() ?? null,
      sourceKind: "LEGAL_ENTITY_ACTIVITY" as const,
    }))
    .filter((activity) => activity.code.length > 0 && activity.name.length > 0);

  const vatActivities = (rskData.Vat ?? [])
    .map((vat) => vat.ActivityCode)
    .filter(
      (activity): activity is SkatturinnActivityCode =>
        Boolean(activity)
    )
    .map((activity) => ({
      code: activity.Id?.trim() ?? "",
      name: activity.Name?.trim() ?? "",
      type: activity.Type?.trim() ?? null,
      codeSystem: activity.CodeSystem?.trim() ?? null,
      sourceKind: "VAT_ACTIVITY" as const,
    }))
    .filter((activity) => activity.code.length > 0 && activity.name.length > 0);

  const activityByCode = new Map<
    string,
    (typeof registryActivities)[number] | (typeof vatActivities)[number]
  >();

  // Almenn starfsemisskrá hefur forgang ef sami ÍSAT-kóði kemur einnig
  // fram sem VSK-starfsemi. VSK-starfsemi er notuð sem örugg viðbót/
  // fallback, sérstaklega fyrir einstaklinga í atvinnurekstri þar sem
  // ActivityCode getur verið tómt en VSK-skráning inniheldur ÍSAT-kóða.
  for (const activity of vatActivities) {
    activityByCode.set(activity.code, activity);
  }

  for (const activity of registryActivities) {
    activityByCode.set(activity.code, activity);
  }

  const rskActivities = Array.from(activityByCode.values());

  const rskCodes = new Set(rskActivities.map((activity) => activity.code));
  const existingByCode = new Map(
    company.activities
      .filter((activity) => activity.code)
      .map((activity) => [activity.code!.trim(), activity])
  );

  const beforeActivities = company.activities.map((activity) => ({
    id: activity.id,
    code: activity.code,
    name: activity.name,
    registeredAtRsk: activity.registeredAtRsk,
    isActive: activity.isActive,
    dataSource: activity.dataSource,
    dataUpdatedAt: activity.dataUpdatedAt,
  }));

  await prisma.$transaction(async (tx) => {
    for (const activity of rskActivities) {
      const existing = existingByCode.get(activity.code);

      if (existing) {
        await tx.companyActivity.update({
          where: { id: existing.id },
          data: {
            name: activity.name,
            registeredAtRsk: true,
            dataSource: "RSK",
            dataUpdatedAt: now,
          },
        });
      } else {
        await tx.companyActivity.create({
          data: {
            companyId,
            code: activity.code,
            name: activity.name,
            registeredAtRsk: true,
            isActive: false,
            dataSource: "RSK",
            dataUpdatedAt: now,
          },
        });
      }
    }

    const previouslyRskActivities = company.activities.filter(
      (activity) =>
        activity.registeredAtRsk &&
        activity.code &&
        !rskCodes.has(activity.code.trim())
    );

    for (const activity of previouslyRskActivities) {
      await tx.companyActivity.update({
        where: { id: activity.id },
        data: {
          registeredAtRsk: false,
          dataUpdatedAt: now,
        },
      });
    }

    await tx.company.update({
      where: { id: companyId },
      data: { rskDataUpdatedAt: now },
    });

    const afterActivities = await tx.companyActivity.findMany({
      where: { companyId },
      orderBy: [{ code: "asc" }, { id: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        registeredAtRsk: true,
        isActive: true,
        dataSource: true,
        dataUpdatedAt: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "Company",
        entityId: companyId,
        action: "SYNC_RSK_COMPANY_REGISTRY",
        source: "RSK",
        description:
          "Starfsemisgreinar fyrirtækis samstilltar við fyrirtækjaskrá Skattsins.",
        beforeData: { activities: beforeActivities },
        afterData: { activities: afterActivities },
        metadata: {
          nationalId: companyNationalId,
          rskName: rskData.Name ?? null,
          rskStatus: rskData.Status ?? null,
          purposeOfEntity: rskData.PurposeOfEntity ?? null,
          activityCount: rskActivities.length,
          registryActivityCount: registryActivities.length,
          vatActivityCount: vatActivities.length,
          activities: rskActivities,
          vat: rskData.Vat ?? [],
        },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath(`/fyrirtaeki/${companyId}`);
  revalidatePath(`/fyrirtaeki/${companyId}/breyta`);

  return {
    nationalId: companyNationalId,
    name: rskData.Name ?? null,
    status: rskData.Status ?? null,
    purposeOfEntity: rskData.PurposeOfEntity ?? null,
    activities: rskActivities,
    vat: rskData.Vat ?? [],
  };
}

export async function uploadRskCertificate(
  companyId: number,
  file: File
) {
  await requireCompanyWriteAccess(
    companyId
  );

  if (!file || file.size === 0) {
    throw new Error(
      "Ekkert vottorð valið."
    );
  }

  if (
    file.type !== "application/pdf"
  ) {
    throw new Error(
      "Vottorðið verður að vera PDF-skjal."
    );
  }

  const filePath =
    await saveRskCertificate(file);

  await prisma.company.update({
    where: {
      id: companyId,
    },
    data: {
      rskCertificatePath: filePath,
      rskDataUpdatedAt: new Date(),
    },
  });

  revalidatePath(
    `/fyrirtaeki/${companyId}`
  );

  revalidatePath(
    `/fyrirtaeki/${companyId}/breyta`
  );
}

export async function initializeCompanyAccounts(
  companyId: number
) {
  await requireCompanyWriteAccess(
    companyId
  );

  const company =
    await prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

  if (!company) {
    throw new Error(
      "Fyrirtæki fannst ekki."
    );
  }

  const existingAccounts =
    await prisma.account.count({
      where: {
        companyId,
      },
    });

  if (existingAccounts > 0) {
    throw new Error(
      "Reikningslykill hefur þegar verið settur upp fyrir þetta fyrirtæki."
    );
  }

  await prisma.account.createMany({
    data: defaultAccounts.map(
      (account) => ({
        number: account.number,
        name: account.name,
        type: account.type,
        entryRole:
          account.entryRole,
        companyId,

        vatRate:
          "vatRate" in account
            ? account.vatRate
            : null,

        vatAccount:
          "vatAccount" in account
            ? account.vatAccount
            : null,

        vatRequiresConfirmation:
          "vatRequiresConfirmation" in
          account
            ? account.vatRequiresConfirmation
            : false,

               vatCode:
            account.vatCode ?? null,

          vatTreatment:
            account.vatTreatment ?? null,

          vatDeductiblePercent:
            account.vatDeductiblePercent ?? null,
      })
    ),
  });

  revalidatePath(
    `/fyrirtaeki/${companyId}`
  );

  revalidatePath(
    `/fyrirtaeki/${companyId}/breyta`
  );
}

export async function addMissingDefaultAccounts(
  companyId: number
) {
  await requireEffectiveAdmin();

  const company =
    await prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

  if (!company) {
    throw new Error(
      "Fyrirtæki fannst ekki."
    );
  }

  const existing =
    await prisma.account.findMany({
      where: {
        companyId,
      },
      select: {
        number: true,
      },
    });

  const existingNumbers = new Set(
    existing.map(
      (account) => account.number
    )
  );

  const missing =
    defaultAccounts.filter(
      (account) =>
        !existingNumbers.has(
          account.number
        )
    );

  if (missing.length > 0) {
    await prisma.account.createMany({
      data: missing.map(
        (account) => ({
          number: account.number,
          name: account.name,
          type: account.type,
          entryRole:
            account.entryRole,
          companyId,

          vatRate:
            account.vatRate ??
            null,

          vatAccount:
            account.vatAccount ??
            null,

          vatRequiresConfirmation:
            account.vatRequiresConfirmation ??
            false,

              vatCode:
            account.vatCode ?? null,

          vatTreatment:
            account.vatTreatment ?? null,

          vatDeductiblePercent:
            account.vatDeductiblePercent ?? null,
        })
      ),
    });
  }

  revalidatePath(
    `/fyrirtaeki/${companyId}`
  );

  revalidatePath(
    "/fylgiskjol"
  );

  return {
    added: missing.length,
  };
}

export async function updateAccountVatSettings(
  companyId: number,
  accountId: number,
  data: {
    vatRate: number | null;
    vatAccount: string | null;
    vatCode: string | null;
    vatTreatment:
      | "OUTPUT"
      | "INPUT"
      | "EXEMPT"
      | "NONE"
      | "REVIEW"
      | "SYSTEM"
      | null;
    vatDeductiblePercent: number | null;
    vatRequiresConfirmation: boolean;
  }
) {
  if (!Number.isInteger(companyId)) {
    throw new Error("Ógilt fyrirtæki.");
  }

  if (!Number.isInteger(accountId)) {
    throw new Error("Ógildur reikningslykill.");
  }

  await requireCompanyWriteAccess(companyId);

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (
    data.vatRate !== null &&
    (!Number.isInteger(data.vatRate) ||
      data.vatRate < 0 ||
      data.vatRate > 100)
  ) {
    throw new Error("Ógilt VSK-hlutfall.");
  }

  if (
    data.vatDeductiblePercent !== null &&
    (!Number.isInteger(data.vatDeductiblePercent) ||
      data.vatDeductiblePercent < 0 ||
      data.vatDeductiblePercent > 100)
  ) {
    throw new Error(
      "Frádráttur verður að vera á bilinu 0–100%."
    );
  }

  const allowedVatTreatments = new Set([
    "OUTPUT",
    "INPUT",
    "EXEMPT",
    "NONE",
    "REVIEW",
    "SYSTEM",
  ]);

  if (
    data.vatTreatment !== null &&
    !allowedVatTreatments.has(data.vatTreatment)
  ) {
    throw new Error("Ógild VSK-meðferð.");
  }

  if (
    data.vatTreatment === null &&
    (data.vatRate !== null ||
      data.vatAccount !== null ||
      data.vatCode !== null ||
      data.vatDeductiblePercent !== null ||
      data.vatRequiresConfirmation)
  ) {
    throw new Error(
      "Velja þarf VSK-meðferð áður en VSK-stillingar eru vistaðar."
    );
  }

  if (
    (data.vatTreatment === "INPUT" ||
      data.vatTreatment === "OUTPUT") &&
    (data.vatRate === null || data.vatRate <= 0)
  ) {
    throw new Error(
      "VSK-hlutfall þarf að vera skilgreint fyrir innskatt eða útskatt."
    );
  }

  if (
  (data.vatTreatment === "INPUT" ||
    data.vatTreatment === "OUTPUT") &&
  data.vatRate !== 24 &&
  data.vatRate !== 11
) {
  throw new Error(
    "VSK-hlutfall verður að vera annaðhvort 24% eða 11%."
  );
}

if (
  (data.vatTreatment === "NONE" ||
    data.vatTreatment === "EXEMPT" ||
    data.vatTreatment === "SYSTEM") &&
  data.vatRate !== null
) {
  throw new Error(
    "Þessi VSK-meðferð má ekki hafa VSK-hlutfall."
  );
}

if (
  (data.vatTreatment === "NONE" ||
    data.vatTreatment === "EXEMPT" ||
    data.vatTreatment === "SYSTEM") &&
  data.vatAccount !== null
) {
  throw new Error(
    "Þessi VSK-meðferð má ekki hafa VSK-reikning."
  );
}

if (
  data.vatTreatment === "NONE" &&
  data.vatCode !== "NO_VAT"
) {
  throw new Error(
    "Engin VSK-meðferð verður að nota VSK-kóðann NO_VAT."
  );
}

if (
  data.vatTreatment === "EXEMPT" &&
  data.vatCode !== "EXEMPT"
) {
  throw new Error(
    "Undanþegin VSK-meðferð verður að nota VSK-kóðann EXEMPT."
  );
}

if (
  data.vatTreatment === "INPUT" &&
  data.vatCode !== `INPUT_${data.vatRate}`
) {
  throw new Error(
    "VSK-kóði innskatts passar ekki við valið VSK-hlutfall."
  );
}

if (
  data.vatTreatment === "OUTPUT" &&
  data.vatCode !== `OUTPUT_${data.vatRate}`
) {
  throw new Error(
    "VSK-kóði útskatts passar ekki við valið VSK-hlutfall."
  );
}

  if (
    data.vatTreatment === "INPUT" &&
    data.vatAccount !== "2520"
  ) {
    throw new Error(
      "Innskattur verður að nota VSK-reikning 2520."
    );
  }

  if (
    data.vatTreatment === "OUTPUT" &&
    data.vatAccount !== "2510"
  ) {
    throw new Error(
      "Útskattur verður að nota VSK-reikning 2510."
    );
  }

  if (
    data.vatTreatment === "REVIEW" &&
    !data.vatRequiresConfirmation
  ) {
    throw new Error(
      "VSK-meðferð sem þarf yfirferð verður að krefjast staðfestingar."
    );
  }

  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      companyId,
    },
    select: {
      id: true,
      number: true,
      name: true,
      vatRate: true,
      vatAccount: true,
      vatCode: true,
      vatTreatment: true,
      vatDeductiblePercent: true,
      vatRequiresConfirmation: true,
    },
  });

  if (!account) {
    throw new Error(
      "Reikningslykill fannst ekki hjá þessu fyrirtæki."
    );
  }

  await prisma.$transaction(async (tx) => {
    const updatedAccount = await tx.account.update({
      where: {
        id: account.id,
      },
      data: {
        vatRate: data.vatRate,
        vatAccount: data.vatAccount,
        vatCode: data.vatCode,
        vatTreatment: data.vatTreatment,
        vatDeductiblePercent:
          data.vatDeductiblePercent,
        vatRequiresConfirmation:
          data.vatRequiresConfirmation,
      },
      select: {
        vatRate: true,
        vatAccount: true,
        vatCode: true,
        vatTreatment: true,
        vatDeductiblePercent: true,
        vatRequiresConfirmation: true,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "Account",
        entityId: account.id,
        action: "UPDATE_VAT_SETTINGS",
        source: "USER",
        description:
          `VSK-stillingum reikningslykils ${account.number} breytt.`,
        beforeData: {
          vatRate: account.vatRate,
          vatAccount: account.vatAccount,
          vatCode: account.vatCode,
          vatTreatment: account.vatTreatment,
          vatDeductiblePercent:
            account.vatDeductiblePercent,
          vatRequiresConfirmation:
            account.vatRequiresConfirmation,
        },
        afterData: {
          vatRate: updatedAccount.vatRate,
          vatAccount: updatedAccount.vatAccount,
          vatCode: updatedAccount.vatCode,
          vatTreatment:
            updatedAccount.vatTreatment,
          vatDeductiblePercent:
            updatedAccount.vatDeductiblePercent,
          vatRequiresConfirmation:
            updatedAccount.vatRequiresConfirmation,
        },
        metadata: {
          accountNumber: account.number,
          accountName: account.name,
        },
      },
    });
  });

  revalidatePath(
    `/fyrirtaeki/${companyId}/reikningslyklar`
  );

  revalidatePath(
    `/fyrirtaeki/${companyId}`
  );
}

export async function approveDefaultAccountVatSuggestion(
  companyId: number,
  accountId: number
) {
  if (!Number.isInteger(companyId)) {
    throw new Error("Ógilt fyrirtæki.");
  }

  if (!Number.isInteger(accountId)) {
    throw new Error("Ógildur reikningslykill.");
  }

  await requireCompanyWriteAccess(companyId);

  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      companyId,
    },
    select: {
      id: true,
      number: true,
      name: true,
    },
  });

  if (!account) {
    throw new Error(
      "Reikningslykill fannst ekki hjá þessu fyrirtæki."
    );
  }

  const suggestion = defaultAccounts.find(
    (item) =>
      item.number === account.number &&
      item.name.trim().toLowerCase() ===
        account.name.trim().toLowerCase()
  );

  if (!suggestion) {
    throw new Error(
      "Engin örugg GLÖGGT-tillaga fannst fyrir þennan reikningslykil."
    );
  }

  if (suggestion.vatRequiresConfirmation === true) {
    throw new Error(
      "Þessi VSK-tillaga krefst yfirferðar bókara."
    );
  }

  if (
    suggestion.vatTreatment !== "INPUT" &&
    suggestion.vatTreatment !== "OUTPUT" &&
    suggestion.vatTreatment !== "NONE"
  ) {
    throw new Error(
      "Ekki er heimilt að hraðsamþykkja þessa VSK-meðferð."
    );
  }

  await updateAccountVatSettings(
    companyId,
    accountId,
    {
      vatRate:
        suggestion.vatTreatment === "INPUT" ||
        suggestion.vatTreatment === "OUTPUT"
          ? suggestion.vatRate ?? null
          : null,

      vatAccount:
        suggestion.vatTreatment === "INPUT"
          ? "2520"
          : suggestion.vatTreatment === "OUTPUT"
            ? "2510"
            : null,

      vatCode:
        suggestion.vatCode ?? null,

      vatTreatment:
        suggestion.vatTreatment,

      vatDeductiblePercent:
        suggestion.vatDeductiblePercent ?? null,

      vatRequiresConfirmation: false,
    }
  );
}

export async function createCompany(
  data: {
    name: string;
    kennitala: string;
    address: string;
    phone: string;
    email: string;
    contact: string;
    vatNumber?: string | null;
  }
) {
  await requireEffectiveAdmin();

  await prisma.company.create({
    data,
  });

  revalidatePath("/");
  revalidatePath(
    "/fyrirtaeki"
  );
}

export async function deleteCompany(
  id: number
) {
  await requireEffectiveAdmin();

  const receiptCount =
    await prisma.receipt.count({
      where: {
        companyId: id,
      },
    });

  const company =
    await prisma.company.findUnique({
      where: {
        id,
      },
      select: {
        nextVoucherNumber: true,
      },
    });

  if (!company) {
    throw new Error(
      "Fyrirtæki fannst ekki."
    );
  }

  if (
    receiptCount > 0 ||
    company.nextVoucherNumber > 1
  ) {
    throw new Error(
      "Ekki er hægt að eyða fyrirtæki sem á bókhaldsgögn. Fyrirtækið þarf að loka eða gera óvirkt í staðinn."
    );
  }

  await prisma.company.delete({
    where: {
      id,
    },
  });

  revalidatePath("/");
  revalidatePath(
    "/fyrirtaeki"
  );
}

export async function deactivateCompany(
  id: number
) {
  await requireEffectiveAdmin();

  await prisma.company.update({
    where: {
      id,
    },
    data: {
      isActive: false,
      closedAt: new Date(),
    },
  });

  const cookieStore =
    await cookies();

  const activeCompanyId =
    cookieStore.get(
      "activeCompanyId"
    )?.value;

  if (
    activeCompanyId === String(id)
  ) {
    cookieStore.delete(
      "activeCompanyId"
    );
  }

  revalidatePath("/");
  revalidatePath(
    "/fyrirtaeki"
  );
  revalidatePath(
    `/fyrirtaeki/${id}`
  );
}

export async function reactivateCompany(
  id: number
) {
  await requireEffectiveAdmin();

  await prisma.company.update({
    where: {
      id,
    },
    data: {
      isActive: true,
      closedAt: null,
    },
  });

  revalidatePath("/");
  revalidatePath(
    "/fyrirtaeki"
  );
  revalidatePath(
    `/fyrirtaeki/${id}`
  );
}

export async function setActiveCompany(
  companyId: number
) {
  await requireCompanyReadAccess(
    companyId
  );

  const company =
    await prisma.company.findUnique({
      where: {
        id: companyId,
      },
      select: {
        id: true,
      },
    });

  if (!company) {
    throw new Error(
      "Fyrirtæki fannst ekki."
    );
  }

  const cookieStore =
    await cookies();

  cookieStore.set(
    "activeCompanyId",
    String(companyId),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure:
        process.env.NODE_ENV ===
        "production",
    }
  );

  revalidatePath("/");
  revalidatePath(
    "/fyrirtaeki"
  );
  revalidatePath(
    "/fylgiskjol"
  );

  redirect(
    `/fyrirtaeki/${companyId}`
  );
}

export async function setActiveCompanyFromAdmin(
  companyId: number
) {
  await requireEffectiveAdmin();

  const company =
    await prisma.company.findUnique({
      where: {
        id: companyId,
      },
      select: {
        id: true,
      },
    });

  if (!company) {
    throw new Error(
      "Fyrirtæki fannst ekki."
    );
  }

  const cookieStore =
    await cookies();

  cookieStore.set(
    "activeCompanyId",
    String(companyId),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure:
        process.env.NODE_ENV ===
        "production",
    }
  );

  revalidatePath(
    "/",
    "layout"
  );

  revalidatePath(
    "/stjornbord"
  );

  revalidatePath(
    `/stjornbord/fyrirtaeki/${companyId}`
  );
}

export async function setReceiptEntryMode(
  companyId: number,
  mode: "AI" | "MANUAL"
) {
  await requireCompanyWriteAccess(
    companyId
  );

  await prisma.company.update({
    where: {
      id: companyId,
    },
    data: {
      receiptEntryMode: mode,
    },
  });

  revalidatePath(
    `/fyrirtaeki/${companyId}`
  );

  revalidatePath(
    "/fylgiskjol/nytt"
  );
}