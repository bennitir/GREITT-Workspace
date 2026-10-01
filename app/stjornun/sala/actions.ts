"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Prisma } from "@/app/generated/prisma/client";
import { requireActiveSalesPermissions } from "@/lib/core/sales-access";
import {
  normalizeSalesTerminalCode,
  normalizeSalesTerminalName,
  parseSalesTerminalType,
} from "@/lib/core/sales-settings";
import { prisma } from "@/lib/prisma";

const SETTINGS_PERMISSION = ["SALE_SETTINGS_MANAGE"] as const;

type SettingsError =
  | "invalid"
  | "inactiveLocation"
  | "branchNotFound"
  | "branchInactive"
  | "invalidTerminal"
  | "terminalCodeExists";

function settingsUrl(params: { saved?: string; error?: SettingsError }) {
  const search = new URLSearchParams();
  if (params.saved) search.set("saved", params.saved);
  if (params.error) search.set("error", params.error);
  const suffix = search.toString();
  return `/stjornun/sala${suffix ? `?${suffix}` : ""}`;
}

function positiveId(formData: FormData, key: string): number | null {
  const value = Number(formData.get(key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function revalidateSalesSettings() {
  revalidatePath("/stjornun");
  revalidatePath("/stjornun/sala");
  revalidatePath("/sala");
}

export async function enableSalesBranchAction(formData: FormData) {
  const { companyId } = await requireActiveSalesPermissions(SETTINGS_PERMISSION);
  const operationalLocationId = positiveId(formData, "operationalLocationId");
  if (!operationalLocationId) redirect(settingsUrl({ error: "invalid" }));

  const location = await prisma.operationalLocation.findUnique({
    where: { id_companyId: { id: operationalLocationId, companyId } },
    select: {
      id: true,
      isActive: true,
      salesBranch: { select: { id: true, isActive: true } },
    },
  });

  if (!location) redirect(settingsUrl({ error: "invalid" }));
  if (!location.isActive) redirect(settingsUrl({ error: "inactiveLocation" }));

  if (location.salesBranch) {
    if (!location.salesBranch.isActive) {
      await prisma.salesBranch.update({
        where: { id_companyId: { id: location.salesBranch.id, companyId } },
        data: { isActive: true },
      });
    }
  } else {
    await prisma.salesBranch.create({
      data: { companyId, operationalLocationId },
    });
  }

  revalidateSalesSettings();
  redirect(settingsUrl({ saved: "branch" }));
}

export async function updateSalesBranchAction(formData: FormData) {
  const { companyId } = await requireActiveSalesPermissions(SETTINGS_PERMISSION);
  const branchId = positiveId(formData, "branchId");
  if (!branchId) redirect(settingsUrl({ error: "invalid" }));

  const branch = await prisma.salesBranch.findUnique({
    where: { id_companyId: { id: branchId, companyId } },
    select: {
      id: true,
      operationalLocation: { select: { isActive: true } },
    },
  });
  if (!branch) redirect(settingsUrl({ error: "branchNotFound" }));

  const isActive = formData.get("isActive") === "on";
  if (isActive && !branch.operationalLocation.isActive) {
    redirect(settingsUrl({ error: "inactiveLocation" }));
  }

  await prisma.salesBranch.update({
    where: { id_companyId: { id: branch.id, companyId } },
    data: { isActive },
  });

  revalidateSalesSettings();
  redirect(settingsUrl({ saved: "branch" }));
}

export async function createSalesTerminalAction(formData: FormData) {
  const { companyId } = await requireActiveSalesPermissions(SETTINGS_PERMISSION);
  const branchId = positiveId(formData, "branchId");
  if (!branchId) redirect(settingsUrl({ error: "invalid" }));

  const branch = await prisma.salesBranch.findUnique({
    where: { id_companyId: { id: branchId, companyId } },
    select: {
      id: true,
      isActive: true,
      operationalLocation: { select: { isActive: true } },
    },
  });
  if (!branch) redirect(settingsUrl({ error: "branchNotFound" }));
  if (!branch.isActive || !branch.operationalLocation.isActive) {
    redirect(settingsUrl({ error: "branchInactive" }));
  }

  let code: string;
  let name: string;
  let terminalType: ReturnType<typeof parseSalesTerminalType>;
  try {
    code = normalizeSalesTerminalCode(String(formData.get("code") ?? ""));
    name = normalizeSalesTerminalName(String(formData.get("name") ?? ""));
    terminalType = parseSalesTerminalType(String(formData.get("terminalType") ?? ""));
  } catch {
    redirect(settingsUrl({ error: "invalidTerminal" }));
  }

  try {
    await prisma.salesTerminal.create({
      data: { companyId, branchId: branch.id, code, name, terminalType },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(settingsUrl({ error: "terminalCodeExists" }));
    }
    throw error;
  }

  revalidateSalesSettings();
  redirect(settingsUrl({ saved: "terminal" }));
}

export async function updateSalesTerminalAction(formData: FormData) {
  const { companyId } = await requireActiveSalesPermissions(SETTINGS_PERMISSION);
  const terminalId = positiveId(formData, "terminalId");
  if (!terminalId) redirect(settingsUrl({ error: "invalid" }));

  const terminal = await prisma.salesTerminal.findFirst({
    where: { id: terminalId, companyId },
    select: { id: true, branchId: true },
  });
  if (!terminal) redirect(settingsUrl({ error: "invalid" }));

  let code: string;
  let name: string;
  let terminalType: ReturnType<typeof parseSalesTerminalType>;
  try {
    code = normalizeSalesTerminalCode(String(formData.get("code") ?? ""));
    name = normalizeSalesTerminalName(String(formData.get("name") ?? ""));
    terminalType = parseSalesTerminalType(String(formData.get("terminalType") ?? ""));
  } catch {
    redirect(settingsUrl({ error: "invalidTerminal" }));
  }

  try {
    await prisma.salesTerminal.update({
      where: {
        id_branchId_companyId: {
          id: terminal.id,
          branchId: terminal.branchId,
          companyId,
        },
      },
      data: {
        code,
        name,
        terminalType,
        isActive: formData.get("isActive") === "on",
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      redirect(settingsUrl({ error: "terminalCodeExists" }));
    }
    throw error;
  }

  revalidateSalesSettings();
  redirect(settingsUrl({ saved: "terminal" }));
}
