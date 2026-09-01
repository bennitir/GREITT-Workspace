"use server";

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
        },
      });

    const submittedIds = activities
      .map((activity) => activity.id)
      .filter((activityId): activityId is number =>
        Number.isInteger(activityId)
      );

    const idsToDelete = existingActivities
      .map((activity) => activity.id)
      .filter(
        (activityId) =>
          !submittedIds.includes(activityId)
      );

    if (idsToDelete.length > 0) {
      await tx.companyActivity.deleteMany({
        where: {
          companyId: id,
          id: {
            in: idsToDelete,
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
        await tx.companyActivity.updateMany({
          where: {
            id: activity.id,
            companyId: id,
          },
          data: {
            code,
            name,
            registeredAtRsk:
              activity.registeredAtRsk,
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
            registeredAtRsk:
              activity.registeredAtRsk,
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