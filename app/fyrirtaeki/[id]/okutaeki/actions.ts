"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  getCompanyAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import {
  isVehicleVatEligibilityStatus,
} from "@/lib/core/vehicle-vat";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { companyVehicleText } from "@/lib/i18n/company-vehicles";
import { prisma } from "@/lib/prisma";

function normalizeRegistration(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function parseDateOnly(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
}

async function settingsContext(companyId: number) {
  const language = await getCurrentInterfaceLanguage();
  const t = companyVehicleText(language);

  if (!Number.isInteger(companyId)) throw new Error(t.errors.invalidCompany);

  const [user, access, company] = await Promise.all([
    getEffectiveUser(),
    getCompanyAccess(companyId),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, isActive: true },
    }),
  ]);

  if (!user || !company || !access.allowed || !access.canManageCompanySettings) {
    throw new Error(t.errors.noAccess);
  }
  if (!company.isActive) throw new Error(t.errors.inactiveCompany);

  return { user, language, t };
}

function revalidateVehiclePaths(companyId: number) {
  revalidatePath(`/fyrirtaeki/${companyId}`);
  revalidatePath(`/fyrirtaeki/${companyId}/okutaeki`);
  revalidatePath("/verk/tilfong");
}


export async function updateCompanyVehicleVatPolicy(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const { user, t } = await settingsContext(companyId);
  const vehicleVatDeductionBlocked =
    formData.get("vehicleVatDeductionBlocked") === "on";

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { vehicleVatDeductionBlocked: true },
  });

  if (!company) throw new Error(t.errors.invalidCompany);

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: { vehicleVatDeductionBlocked },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "COMPANY",
        entityId: companyId,
        action: "VEHICLE_VAT_POLICY_UPDATED",
        source: "USER",
        description: t.auditCompanyVatPolicyChanged,
        beforeData: {
          vehicleVatDeductionBlocked: company.vehicleVatDeductionBlocked,
        },
        afterData: {
          vehicleVatDeductionBlocked,
        },
      },
    });
  });

  revalidateVehiclePaths(companyId);
  redirect(`/fyrirtaeki/${companyId}?saved=vehicle-vat-policy`);
}

export async function createCompanyVehicle(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const { user, language, t } = await settingsContext(companyId);
  const code = normalizeRegistration(String(formData.get("registration") ?? ""));
  const name = String(formData.get("name") ?? "").trim();

  if (!code || code.length > 60) throw new Error(t.errors.invalidRegistration);
  if (!name || name.length > 160) throw new Error(t.errors.invalidName);

  const existing = await prisma.workResource.findFirst({
    where: { companyId, code },
    select: { id: true },
  });
  if (existing) throw new Error(t.errors.duplicateRegistration);

  await prisma.$transaction(async (tx) => {
    const vehicle = await tx.workResource.create({
      data: {
        companyId,
        kind: "VEHICLE",
        code,
        name,
        sourceLanguage: language,
        status: "AVAILABLE",
        baseUnit: "KM",
        meterUnit: "KM",
        travelMode: "ROAD",
        qrToken: randomBytes(8).toString("hex"),
        vatEligibilityStatus: "UNCONFIRMED",
        createdById: user.id,
        updatedById: user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "WORK_RESOURCE",
        entityId: vehicle.id,
        action: "CREATED",
        source: "USER",
        description: t.auditCreated,
        afterData: {
          kind: "VEHICLE",
          code,
          name,
          vatEligibilityStatus: "UNCONFIRMED",
        },
      },
    });
  });

  revalidateVehiclePaths(companyId);
  redirect(`/fyrirtaeki/${companyId}/okutaeki?saved=created`);
}

export async function updateVehicleVatEligibility(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const resourceId = Number(formData.get("resourceId"));
  const status = String(formData.get("vatEligibilityStatus") ?? "").trim();
  const { user, t } = await settingsContext(companyId);

  if (!Number.isInteger(resourceId)) throw new Error(t.errors.invalidVehicle);
  if (!isVehicleVatEligibilityStatus(status)) throw new Error(t.errors.invalidVatStatus);

  const validFrom =
    status === "UNCONFIRMED"
      ? null
      : parseDateOnly(formData.get("vatEligibilityValidFrom"));

  if (status !== "UNCONFIRMED" && !validFrom) {
    throw new Error(t.errors.validFromRequired);
  }

  const vehicle = await prisma.workResource.findFirst({
    where: {
      id: resourceId,
      companyId,
      kind: "VEHICLE",
    },
    select: {
      id: true,
      vatEligibilityStatus: true,
      vatEligibilityValidFrom: true,
      vatEligibilityConfirmedAt: true,
      vatEligibilityConfirmedById: true,
    },
  });

  if (!vehicle) throw new Error(t.errors.invalidVehicle);

  const confirmed = status !== "UNCONFIRMED";
  const confirmedAt = confirmed ? new Date() : null;
  const confirmedById = confirmed ? user.id : null;

  await prisma.$transaction(async (tx) => {
    await tx.workResource.update({
      where: { id: resourceId },
      data: {
        vatEligibilityStatus: status,
        vatEligibilityValidFrom: validFrom,
        vatEligibilityConfirmedAt: confirmedAt,
        vatEligibilityConfirmedById: confirmedById,
        updatedById: user.id,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "WORK_RESOURCE",
        entityId: resourceId,
        action: "VAT_ELIGIBILITY_UPDATED",
        source: "USER",
        description: t.auditVatChanged,
        beforeData: {
          vatEligibilityStatus: vehicle.vatEligibilityStatus,
          vatEligibilityValidFrom: vehicle.vatEligibilityValidFrom?.toISOString() ?? null,
          vatEligibilityConfirmedAt: vehicle.vatEligibilityConfirmedAt?.toISOString() ?? null,
          vatEligibilityConfirmedById: vehicle.vatEligibilityConfirmedById,
        },
        afterData: {
          vatEligibilityStatus: status,
          vatEligibilityValidFrom: validFrom?.toISOString() ?? null,
          vatEligibilityConfirmedAt: confirmedAt?.toISOString() ?? null,
          vatEligibilityConfirmedById: confirmedById,
        },
      },
    });
  });

  revalidateVehiclePaths(companyId);
  redirect(`/fyrirtaeki/${companyId}/okutaeki?saved=vat`);
}
