import {
  SUPPORTED_UI_LANGUAGES,
  normalizeUiLanguage,
  type UiLanguage,
} from "@/lib/i18n/ui";
import { prisma } from "@/lib/prisma";
import {
  translateWork10OperationalItems,
  type Work10TranslationItem,
} from "@/lib/work10/translation-service";

const TERMINAL_PART_STATUSES = ["COMPLETED", "CANCELLED"];

function isUsableTranslation(language: string, value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return false;
  if (normalizeUiLanguage(language) !== "sr") return true;

  // Serbian UI in GLÖGGT uses Cyrillic. Existing Latin-script prose is
  // treated as missing so it can be regenerated without touching source text.
  // Pure identifiers/codes (e.g. JL-564) are allowed to remain Latin.
  if (/^[A-Z0-9._:/+\-\s]+$/u.test(text)) return true;
  const hasLatinWord = /[A-Za-zČĆŽŠĐčćžšđ]{2,}/u.test(text);
  if (!hasLatinWord) return true;
  return /[А-Яа-яЉЊЂЋЏљњђћџ]/u.test(text);
}

function normalizeTargets(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeUiLanguage(value))
        .filter((language) => SUPPORTED_UI_LANGUAGES.includes(language)),
    ),
  );
}

function missingTargetsForField(args: {
  sourceLanguage: string;
  existing: Array<{ language: string; hasText: boolean }>;
  targets: UiLanguage[];
}) {
  const sourceLanguage = normalizeUiLanguage(args.sourceLanguage);
  const existing = new Set(
    args.existing
      .filter((item) => item.hasText)
      .map((item) => normalizeUiLanguage(item.language)),
  );

  return args.targets.filter(
    (language) => language !== sourceLanguage && !existing.has(language),
  );
}

export async function ensureWork10OperationalTranslationsForWorkOrders(args: {
  companyId: number;
  userId: number | null;
  workOrderIds: number[];
  targetLanguages: Array<string | null | undefined>;
}) {
  const workOrderIds = Array.from(
    new Set(args.workOrderIds.filter((id) => Number.isInteger(id) && id > 0)),
  );
  const targetLanguages = normalizeTargets(args.targetLanguages);

  if (workOrderIds.length === 0 || targetLanguages.length === 0) {
    return { translatedCount: 0, workOrderCount: 0 };
  }

  const works = await prisma.workOrder.findMany({
    where: {
      companyId: args.companyId,
      id: { in: workOrderIds },
    },
    select: {
      id: true,
      sourceLanguage: true,
      title: true,
      description: true,
      translations: {
        select: {
          language: true,
          title: true,
          description: true,
        },
      },
      workParts: {
        select: {
          id: true,
          sourceLanguage: true,
          title: true,
          description: true,
          translations: {
            select: {
              language: true,
              title: true,
              description: true,
            },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });

  const items: Work10TranslationItem[] = [];

  for (const work of works) {
    const workTitleTargets = missingTargetsForField({
      sourceLanguage: work.sourceLanguage,
      existing: work.translations.map((translation) => ({
        language: translation.language,
        hasText: isUsableTranslation(translation.language, translation.title),
      })),
      targets: targetLanguages,
    });
    if (workTitleTargets.length > 0) {
      items.push({
        key: `work:${work.id}:title`,
        sourceLanguage: normalizeUiLanguage(work.sourceLanguage),
        text: work.title,
        targetLanguages: workTitleTargets,
      });
    }

    if (work.description?.trim()) {
      const workDescriptionTargets = missingTargetsForField({
        sourceLanguage: work.sourceLanguage,
        existing: work.translations.map((translation) => ({
          language: translation.language,
          hasText: isUsableTranslation(translation.language, translation.description),
        })),
        targets: targetLanguages,
      });
      if (workDescriptionTargets.length > 0) {
        items.push({
          key: `work:${work.id}:description`,
          sourceLanguage: normalizeUiLanguage(work.sourceLanguage),
          text: work.description,
          targetLanguages: workDescriptionTargets,
        });
      }
    }

    for (const part of work.workParts) {
      const partTitleTargets = missingTargetsForField({
        sourceLanguage: part.sourceLanguage,
        existing: part.translations.map((translation) => ({
          language: translation.language,
          hasText: isUsableTranslation(translation.language, translation.title),
        })),
        targets: targetLanguages,
      });
      if (partTitleTargets.length > 0) {
        items.push({
          key: `part:${part.id}:title`,
          sourceLanguage: normalizeUiLanguage(part.sourceLanguage),
          text: part.title,
          targetLanguages: partTitleTargets,
        });
      }

      if (part.description?.trim()) {
        const partDescriptionTargets = missingTargetsForField({
          sourceLanguage: part.sourceLanguage,
          existing: part.translations.map((translation) => ({
            language: translation.language,
            hasText: isUsableTranslation(translation.language, translation.description),
          })),
          targets: targetLanguages,
        });
        if (partDescriptionTargets.length > 0) {
          items.push({
            key: `part:${part.id}:description`,
            sourceLanguage: normalizeUiLanguage(part.sourceLanguage),
            text: part.description,
            targetLanguages: partDescriptionTargets,
          });
        }
      }

    }
  }

  if (items.length === 0) {
    return { translatedCount: 0, workOrderCount: works.length };
  }

  const translations = await translateWork10OperationalItems({
    companyId: args.companyId,
    userId: args.userId,
    items,
  });

  await prisma.$transaction(async (tx) => {
    for (const translation of translations) {
      const [kind, rawId, field] = translation.key.split(":");
      const id = Number(rawId);
      if (!Number.isInteger(id)) continue;

      if (kind === "work" && (field === "title" || field === "description")) {
        const existing = await tx.workOrderTranslation.findUnique({
          where: {
            workOrderId_language: {
              workOrderId: id,
              language: translation.language,
            },
          },
          select: { id: true, title: true, description: true },
        });
        const existingField = existing?.[field]?.trim();
        if (isUsableTranslation(translation.language, existingField)) continue;

        if (existing) {
          await tx.workOrderTranslation.update({
            where: { id: existing.id },
            data:
              field === "title"
                ? { title: translation.text }
                : { description: translation.text },
          });
        } else {
          await tx.workOrderTranslation.create({
            data: {
              workOrderId: id,
              language: translation.language,
              title: field === "title" ? translation.text : null,
              description: field === "description" ? translation.text : null,
              source: "AI",
              createdById: args.userId,
            },
          });
        }
      }

      if (kind === "part" && (field === "title" || field === "description")) {
        const existing = await tx.workPartTranslation.findUnique({
          where: {
            workPartId_language: {
              workPartId: id,
              language: translation.language,
            },
          },
          select: { id: true, title: true, description: true },
        });
        const existingField = existing?.[field]?.trim();
        if (isUsableTranslation(translation.language, existingField)) continue;

        if (existing) {
          await tx.workPartTranslation.update({
            where: { id: existing.id },
            data:
              field === "title"
                ? { title: translation.text }
                : { description: translation.text },
          });
        } else {
          await tx.workPartTranslation.create({
            data: {
              workPartId: id,
              language: translation.language,
              title: field === "title" ? translation.text : null,
              description: field === "description" ? translation.text : null,
              source: "AI",
              createdById: args.userId,
            },
          });
        }
      }

    }
  });

  return {
    translatedCount: translations.length,
    workOrderCount: works.length,
  };
}

export async function activeAssignedWorkOrderIdsForUser(args: {
  companyId: number;
  userId: number;
  limit?: number;
}) {
  const employee = await prisma.employee.findFirst({
    where: {
      companyId: args.companyId,
      userId: args.userId,
      isActive: true,
    },
    select: { id: true },
  });

  const teamIds = employee
    ? (
        await prisma.workResourceMember.findMany({
          where: {
            companyId: args.companyId,
            employeeId: employee.id,
            removedAt: null,
            workResource: {
              kind: "TEAM",
              isActive: true,
            },
          },
          select: { workResourceId: true },
        })
      ).map((membership) => membership.workResourceId)
    : [];

  const works = await prisma.workOrder.findMany({
    where: {
      companyId: args.companyId,
      workParts: {
        some: {
          status: { notIn: TERMINAL_PART_STATUSES },
          assignments: {
            some: {
              removedAt: null,
              OR: [
                { userId: args.userId },
                ...(employee ? [{ employeeId: employee.id }] : []),
                ...(teamIds.length > 0
                  ? [
                      {
                        resourceKind: "TEAM",
                        workResourceId: { in: teamIds },
                      },
                    ]
                  : []),
              ],
            },
          },
        },
      },
    },
    select: { id: true },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: Math.max(1, Math.min(args.limit ?? 30, 100)),
  });

  return works.map((work) => work.id);
}

export async function effectiveUiLanguagesForUsers(args: {
  companyId: number;
  userIds: number[];
}) {
  const userIds = Array.from(
    new Set(args.userIds.filter((id) => Number.isInteger(id) && id > 0)),
  );
  if (userIds.length === 0) return [] as UiLanguage[];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: {
      settings: { select: { interfaceLanguage: true } },
      employeeProfiles: {
        where: { companyId: args.companyId, isActive: true },
        select: { preferredLanguage: true },
        take: 1,
      },
    },
  });

  return normalizeTargets(
    users.map(
      (user) =>
        user.settings?.interfaceLanguage ||
        user.employeeProfiles[0]?.preferredLanguage ||
        "is",
    ),
  );
}
