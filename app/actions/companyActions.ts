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