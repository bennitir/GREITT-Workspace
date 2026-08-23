"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { defaultAccounts } from "@/app/data/accounts";

async function saveRskCertificate(file: File) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "rsk-certificates"
  );

  await fs.mkdir(uploadDir, { recursive: true });

  const safeName = file.name.replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );

  const fileName = `${Date.now()}-${safeName}`;
  const fullPath = path.join(uploadDir, fileName);

  await fs.writeFile(fullPath, buffer);

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

    nextVoucherNumber?: number;

    rskRegisteredActivities?: string | null;
    activeActivities?: string | null;
    rskCertificatePath?: string | null;
    rskDataUpdatedAt?: Date | null;
    activitiesConfirmedAt?: Date | null;
    activitiesConfirmedBy?: string | null;
  }
) {
  const currentCompany = await prisma.company.findUnique({
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
  throw new Error("Fyrirtæki fannst ekki.");
  }

  const hasAccountingData =
  currentCompany._count.receipts > 0 ||
  currentCompany._count.accounts > 0;

if (
  hasAccountingData &&
  data.kennitala &&
  data.kennitala !== currentCompany.kennitala
) {
  throw new Error(
    "Ekki er hægt að breyta kennitölu eftir að bókhaldsgögn hafa verið skráð."
  );
}

  await prisma.company.update({
  where: {
    id,
  },
  data,
});

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath(`/fyrirtaeki/${id}`);
  revalidatePath(`/fyrirtaeki/${id}/breyta`);
}

export async function uploadRskCertificate(
  companyId: number,
  file: File
) {
  if (!file || file.size === 0) {
    throw new Error("Ekkert vottorð valið.");
  }

  if (file.type !== "application/pdf") {
    throw new Error(
      "Vottorðið verður að vera PDF-skjal."
    );
  }

  const filePath = await saveRskCertificate(file);

  await prisma.company.update({
    where: {
      id: companyId,
    },
    data: {
      rskCertificatePath: filePath,
      rskDataUpdatedAt: new Date(),
    },
  });

  revalidatePath(`/fyrirtaeki/${companyId}`);
  revalidatePath(
    `/fyrirtaeki/${companyId}/breyta`
  );
}

export async function initializeCompanyAccounts(
  companyId: number
) {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
  });

  if (!company) {
    throw new Error("Fyrirtæki fannst ekki.");
  }

  const existingAccounts = await prisma.account.count({
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
  data: defaultAccounts.map((account) => ({
    number: account.number,
    name: account.name,
    type: account.type,
    entryRole: account.entryRole,
    companyId,

    vatRate: "vatRate" in account ? account.vatRate : null,
    vatAccount: "vatAccount" in account ? account.vatAccount : null,
    vatRequiresConfirmation:
      "vatRequiresConfirmation" in account
        ? account.vatRequiresConfirmation
        : false,
  })),
});


  revalidatePath(`/fyrirtaeki/${companyId}`);
  revalidatePath(
    `/fyrirtaeki/${companyId}/breyta`
  );
}

export async function createCompany(data: {
  name: string;
  kennitala: string;
  address: string;
  phone: string;
  email: string;
  contact: string;
  vatNumber?: string | null;
}) {
  await prisma.company.create({
    data,
  });

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
}

export async function deleteCompany(id: number) {
    const receiptCount = await prisma.receipt.count({
          where: {
      companyId: id,
    },
  });
  

  const company = await prisma.company.findUnique({
  where: {
    id,
  },
  select: {
    nextVoucherNumber: true,
  },
});

if (
  receiptCount > 0 ||
  (company?.nextVoucherNumber ?? 1) > 1
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
  revalidatePath("/fyrirtaeki");
}

export async function deactivateCompany(id: number) {
  await prisma.company.update({
  where: {
    id,
  },
  data: {
    isActive: false,
    closedAt: new Date(),
  },
});
const cookieStore = await cookies();
const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

if (activeCompanyId === String(id)) {
  cookieStore.delete("activeCompanyId");
}

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath(`/fyrirtaeki/${id}`);
}

export async function reactivateCompany(id: number) {
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
  revalidatePath("/fyrirtaeki");
  revalidatePath(`/fyrirtaeki/${id}`);
}

export async function setActiveCompany(
  companyId: number
) {
  const cookieStore = await cookies();

  cookieStore.set(
    "activeCompanyId",
    String(companyId),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    }
  );

  revalidatePath("/");
revalidatePath("/fyrirtaeki");
revalidatePath("/fylgiskjol");

redirect("/fylgiskjol");

  }
export async function setReceiptEntryMode(
  companyId: number,
  mode: "AI" | "MANUAL"
) {
  await prisma.company.update({
    where: {
      id: companyId,
    },
    data: {
      receiptEntryMode: mode,
    },
  });

  revalidatePath(`/fyrirtaeki/${companyId}`);
  revalidatePath("/fylgiskjol/nytt");
}