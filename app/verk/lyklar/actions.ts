"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getEffectiveUser, requireActiveCompanyWriteAccess } from "@/lib/core/access-control";
import { workKeyText } from "@/lib/i18n/work-keys";
import { prisma } from "@/lib/prisma";
import { parseWorkKeyImportFile, WorkKeyImportError } from "@/lib/work10/work-key-import";
import { cleanWorkKeyCode, normalizeWorkKeyCode } from "@/lib/work10/work-keys";
import { WORK_START_RULE_KINDS, type WorkStartRuleKind } from "@/lib/work10/work-start-requirements";

async function actionContext() {
  const companyId = await requireActiveCompanyWriteAccess();
  const user = await getEffectiveUser();
  const settings = user
    ? await prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } })
    : null;
  const language = settings?.interfaceLanguage ?? "is";
  return { companyId, userId: user?.id ?? null, t: workKeyText(language) };
}

function revalidateWorkKeys() {
  revalidatePath("/verk");
  revalidatePath("/verk/nytt");
  revalidatePath("/verk/lyklar");
  revalidatePath("/mobile/verk");
  revalidatePath("/mobile/verk/dagbok");
}

function readFields(formData: FormData) {
  const code = cleanWorkKeyCode(formData.get("code"));
  const normalizedCode = normalizeWorkKeyCode(code);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const externalId = String(formData.get("externalId") ?? "").trim();
  return { code, normalizedCode, name, description, externalId };
}

function readStartRuleKinds(formData: FormData): WorkStartRuleKind[] {
  const selected: WorkStartRuleKind[] = [];
  if (formData.get("startGpsProgress") === "true") selected.push("GPS_PROGRESS");
  if (formData.get("startChainCount") === "true") selected.push("CHAIN_COUNT");
  if (formData.get("startPhoto") === "true") selected.push("START_PHOTO");
  return selected;
}

function startRuleRows(kinds: readonly WorkStartRuleKind[]) {
  return kinds.map((kind, index) => ({ kind, required: true, sortOrder: index + 1, isActive: true }));
}

export async function createWorkKey(formData: FormData) {
  const { companyId, userId, t } = await actionContext();
  const fields = readFields(formData);
  const startRuleKinds = readStartRuleKinds(formData);
  if (!fields.code || fields.code.length > 120) throw new Error(t.errors.invalidCode);
  if (!fields.name || fields.name.length > 200) throw new Error(t.errors.invalidName);
  if (fields.description.length > 2000) throw new Error(t.errors.descriptionTooLong);
  if (fields.externalId.length > 160) throw new Error(t.errors.externalIdTooLong);

  const existing = await prisma.workKey.findUnique({
    where: { companyId_normalizedCode: { companyId, normalizedCode: fields.normalizedCode } },
    select: { id: true },
  });
  if (existing) redirect("/verk/lyklar?createError=duplicate");

  await prisma.$transaction(async (tx) => {
    const key = await tx.workKey.create({
      data: {
        companyId,
        code: fields.code,
        normalizedCode: fields.normalizedCode,
        name: fields.name,
        description: fields.description || null,
        externalId: fields.externalId || null,
        source: "MANUAL",
        createdById: userId,
        updatedById: userId,
        startRules: startRuleKinds.length > 0 ? { create: startRuleRows(startRuleKinds) } : undefined,
      },
    });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_KEY",
        entityId: key.id,
        action: "CREATED",
        source: "USER",
        description: t.auditCreated,
        afterData: { code: key.code, name: key.name, externalId: key.externalId, startRules: startRuleKinds },
      },
    });
  });

  revalidateWorkKeys();
}

export async function updateWorkKey(formData: FormData) {
  const { companyId, userId, t } = await actionContext();
  const workKeyId = Number(formData.get("workKeyId"));
  if (!Number.isInteger(workKeyId) || workKeyId < 1) throw new Error(t.errors.notFound);
  const fields = readFields(formData);
  const startRuleKinds = readStartRuleKinds(formData);
  if (!fields.code || fields.code.length > 120) throw new Error(t.errors.invalidCode);
  if (!fields.name || fields.name.length > 200) throw new Error(t.errors.invalidName);
  if (fields.description.length > 2000) throw new Error(t.errors.descriptionTooLong);
  if (fields.externalId.length > 160) throw new Error(t.errors.externalIdTooLong);

  const current = await prisma.workKey.findFirst({
    where: { id: workKeyId, companyId },
    include: { startRules: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!current) throw new Error(t.errors.notFound);
  const duplicate = await prisma.workKey.findFirst({
    where: { companyId, normalizedCode: fields.normalizedCode, NOT: { id: workKeyId } },
    select: { id: true },
  });
  if (duplicate) redirect("/verk/lyklar?createError=duplicate");

  await prisma.$transaction(async (tx) => {
    const updated = await tx.workKey.update({
      where: { id: current.id },
      data: {
        code: fields.code,
        normalizedCode: fields.normalizedCode,
        name: fields.name,
        description: fields.description || null,
        externalId: fields.externalId || null,
        updatedById: userId,
      },
    });

    await tx.workKeyStartRule.deleteMany({
      where: { workKeyId: updated.id, kind: { in: [...WORK_START_RULE_KINDS] } },
    });
    if (startRuleKinds.length > 0) {
      await tx.workKeyStartRule.createMany({
        data: startRuleRows(startRuleKinds).map((rule) => ({ ...rule, workKeyId: updated.id })),
      });
    }

    // Verk/Dagbók geyma denormalíserað sýnilegt kóðagildi. Þegar kóði master-lykils
    // breytist uppfærum við tengda textann; AuditEvent varðveitir breytingasöguna.
    if (updated.code !== current.code) {
      await tx.workOrder.updateMany({ where: { companyId, workKeyId: updated.id }, data: { workKey: updated.code } });
      await tx.employeeWorkDiaryEntry.updateMany({ where: { companyId, workKeyId: updated.id }, data: { workKey: updated.code } });
    }

    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_KEY",
        entityId: updated.id,
        action: "UPDATED",
        source: "USER",
        description: t.auditUpdated,
        beforeData: {
          code: current.code,
          name: current.name,
          description: current.description,
          externalId: current.externalId,
          startRules: current.startRules.map((rule) => rule.kind),
        },
        afterData: {
          code: updated.code,
          name: updated.name,
          description: updated.description,
          externalId: updated.externalId,
          startRules: startRuleKinds,
        },
      },
    });
  });

  revalidateWorkKeys();
}

export async function setWorkKeyActive(formData: FormData) {
  const { companyId, userId, t } = await actionContext();
  const workKeyId = Number(formData.get("workKeyId"));
  const isActive = String(formData.get("isActive") ?? "") === "true";
  const current = await prisma.workKey.findFirst({ where: { id: workKeyId, companyId } });
  if (!current) throw new Error(t.errors.notFound);

  await prisma.$transaction(async (tx) => {
    await tx.workKey.update({ where: { id: current.id }, data: { isActive, updatedById: userId } });
    await tx.auditEvent.create({
      data: {
        companyId,
        userId,
        entityType: "WORK_KEY",
        entityId: current.id,
        action: isActive ? "ACTIVATED" : "DEACTIVATED",
        source: "USER",
        description: t.auditStatus,
        beforeData: { isActive: current.isActive },
        afterData: { isActive },
      },
    });
  });
  revalidateWorkKeys();
}

export async function importWorkKeys(formData: FormData) {
  const { companyId, userId, t } = await actionContext();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error(t.errors.invalidFile);
  if (file.size > 8 * 1024 * 1024) throw new Error(t.errors.fileTooLarge);

  let parsed: ReturnType<typeof parseWorkKeyImportFile>;
  try {
    parsed = parseWorkKeyImportFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    const message = error instanceof WorkKeyImportError
      ? ({
          UNSUPPORTED_FILE: t.errors.unsupportedFile,
          NO_SHEET: t.errors.noSheet,
          EMPTY_FILE: t.errors.emptyFile,
          TOO_MANY_ROWS: t.errors.tooManyRows,
          HEADER_MISSING: t.errors.headerMissing,
          NO_VALID_ROWS: t.errors.noValidRows,
        } as const)[error.code]
      : t.errors.invalidFile;
    redirect(`/verk/lyklar?importError=${encodeURIComponent(message.slice(0, 220))}`);
  }

  const existing = await prisma.workKey.findMany({
    where: { companyId, normalizedCode: { in: parsed.rows.map((row) => row.normalizedCode) } },
  });
  const existingByCode = new Map(existing.map((key) => [key.normalizedCode, key]));
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of parsed.rows) {
      const current = existingByCode.get(row.normalizedCode);
      if (current) {
        const key = await tx.workKey.update({
          where: { id: current.id },
          data: {
            code: row.code,
            name: row.name || current.name,
            description: row.description ?? current.description,
            externalId: row.externalId ?? current.externalId,
            isActive: row.isActive ?? current.isActive,
            source: current.source === "MIGRATED" ? "IMPORTED" : current.source,
            updatedById: userId,
          },
        });
        if (key.code !== current.code) {
          await tx.workOrder.updateMany({ where: { companyId, workKeyId: key.id }, data: { workKey: key.code } });
          await tx.employeeWorkDiaryEntry.updateMany({ where: { companyId, workKeyId: key.id }, data: { workKey: key.code } });
        }
        await tx.auditEvent.create({
          data: {
            companyId,
            userId,
            entityType: "WORK_KEY",
            entityId: key.id,
            action: "IMPORTED_UPDATED",
            source: "IMPORT",
            description: t.auditImported,
            metadata: { fileName: file.name, sheetName: parsed.sheetName, rowNumber: row.rowNumber },
          },
        });
        updated += 1;
      } else {
        const key = await tx.workKey.create({
          data: {
            companyId,
            code: row.code,
            normalizedCode: row.normalizedCode,
            name: row.name,
            description: row.description,
            externalId: row.externalId,
            isActive: row.isActive ?? true,
            source: "IMPORTED",
            createdById: userId,
            updatedById: userId,
          },
        });
        await tx.auditEvent.create({
          data: {
            companyId,
            userId,
            entityType: "WORK_KEY",
            entityId: key.id,
            action: "IMPORTED_CREATED",
            source: "IMPORT",
            description: t.auditImported,
            metadata: { fileName: file.name, sheetName: parsed.sheetName, rowNumber: row.rowNumber },
          },
        });
        created += 1;
      }
    }
  }, { timeout: 60_000 });

  revalidateWorkKeys();
  const skipped = parsed.ignoredRows + parsed.duplicateRows;
  redirect(`/verk/lyklar?imported=${created}&updated=${updated}&skipped=${skipped}&duplicates=${parsed.duplicateRows}`);
}
