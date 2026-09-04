import { prisma } from "@/lib/prisma";

type JsonPrimitive = string | number | boolean | null;

type JsonValue =
  | JsonPrimitive
  | JsonObject
  | JsonValue[];

type JsonObject = {
  [key: string]: JsonValue;
};

type InsightTx = Pick<
  typeof prisma,
  | "insightProcessingJob"
  | "insightProcessingItem"
  | "receipt"
  | "aiDetectedDocument"
  | "auditEvent"
>;

export const INSIGHT_JOB_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  COMPLETED_WITH_ERRORS: "COMPLETED_WITH_ERRORS",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const INSIGHT_ITEM_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type InsightProcessingTarget = {
  receiptId: number;
  documentId?: number | null;
};

export type CreateInsightProcessingJobInput = {
  companyId: number;
  requestedById?: number | null;
  jobType: string;
  processingVersion: string;
  source?: string;
  targets: InsightProcessingTarget[];
  metadata?: JsonObject | null;
};

export type CompleteInsightProcessingItemInput = {
  itemId: number;
  resultMetadata?: JsonObject | null;
};

export type FailInsightProcessingItemInput = {
  itemId: number;
  errorMessage: string;
  resultMetadata?: JsonObject | null;
};

export type RecoverStaleInsightProcessingItemsInput = {
  staleAfterMinutes?: number;
  jobId?: number;
};

export const DEFAULT_INSIGHT_STALE_AFTER_MINUTES = 10;

function buildItemKey(target: InsightProcessingTarget) {
  if (target.documentId != null) {
    return `DOCUMENT:${target.documentId}`;
  }

  return `RECEIPT:${target.receiptId}`;
}

function cleanErrorMessage(value: unknown) {
  if (value instanceof Error) {
    return value.message.slice(0, 4000);
  }

  if (typeof value === "string") {
    return value.slice(0, 4000);
  }

  return "Óþekkt villa í Innsýn-vinnslu.";
}

async function validateTargets(
  tx: InsightTx,
  companyId: number,
  targets: InsightProcessingTarget[],
) {
  if (targets.length === 0) {
    throw new Error("Engin skjöl voru valin fyrir Innsýn-vinnslu.");
  }

  const uniqueTargets = new Map<string, InsightProcessingTarget>();

  for (const target of targets) {
    if (!Number.isInteger(target.receiptId) || target.receiptId <= 0) {
      throw new Error("Ógilt fylgiskjal í Innsýn-vinnslu.");
    }

    if (
      target.documentId != null &&
      (!Number.isInteger(target.documentId) || target.documentId <= 0)
    ) {
      throw new Error("Ógilt greint skjal í Innsýn-vinnslu.");
    }

    uniqueTargets.set(buildItemKey(target), target);
  }

  const deduplicated = Array.from(uniqueTargets.values());

  const receiptIds = [
    ...new Set(deduplicated.map((target) => target.receiptId)),
  ];

  const receipts = await tx.receipt.findMany({
    where: {
      id: {
        in: receiptIds,
      },
      companyId,
    },
    select: {
      id: true,
    },
  });

  const validReceiptIds = new Set(
    receipts.map((receipt) => receipt.id),
  );

  for (const target of deduplicated) {
    if (!validReceiptIds.has(target.receiptId)) {
      throw new Error(
        `Fylgiskjal ${target.receiptId} fannst ekki hjá valda fyrirtækinu.`,
      );
    }
  }

  const targetsWithDocuments = deduplicated.filter(
    (
      target,
    ): target is InsightProcessingTarget & {
      documentId: number;
    } => target.documentId != null,
  );

  if (targetsWithDocuments.length > 0) {
    const documentIds = targetsWithDocuments.map(
      (target) => target.documentId,
    );

    const documents = await tx.aiDetectedDocument.findMany({
      where: {
        id: {
          in: documentIds,
        },
        receipt: {
          companyId,
        },
      },
      select: {
        id: true,
        receiptId: true,
      },
    });

    const documentsById = new Map(
      documents.map((document) => [
        document.id,
        document,
      ]),
    );

    for (const target of targetsWithDocuments) {
      const document = documentsById.get(
        target.documentId,
      );

      if (!document) {
        throw new Error(
          `Greint skjal ${target.documentId} fannst ekki hjá valda fyrirtækinu.`,
        );
      }

      if (document.receiptId !== target.receiptId) {
        throw new Error(
          `Greint skjal ${target.documentId} tilheyrir ekki fylgiskjali ${target.receiptId}.`,
        );
      }
    }
  }

  return deduplicated;
}

async function recomputeJobState(
  tx: InsightTx,
  jobId: number,
) {
  const job =
    await tx.insightProcessingJob.findUnique({
      where: {
        id: jobId,
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

  if (!job) {
    throw new Error(
      `Innsýn-vinnsluverk ${jobId} fannst ekki.`,
    );
  }

  const [
    totalItems,
    pendingItems,
    processingItems,
    completedItems,
    failedItems,
  ] = await Promise.all([
    tx.insightProcessingItem.count({
      where: {
        jobId,
      },
    }),

    tx.insightProcessingItem.count({
      where: {
        jobId,
        status: INSIGHT_ITEM_STATUS.PENDING,
      },
    }),

    tx.insightProcessingItem.count({
      where: {
        jobId,
        status: INSIGHT_ITEM_STATUS.PROCESSING,
      },
    }),

    tx.insightProcessingItem.count({
      where: {
        jobId,
        status: INSIGHT_ITEM_STATUS.COMPLETED,
      },
    }),

    tx.insightProcessingItem.count({
      where: {
        jobId,
        status: INSIGHT_ITEM_STATUS.FAILED,
      },
    }),
  ]);

  let status: string =
    INSIGHT_JOB_STATUS.PENDING;

  let startedAt = job.startedAt;
  let completedAt: Date | null = null;

  const hasStarted =
    processingItems > 0 ||
    completedItems > 0 ||
    failedItems > 0 ||
    job.startedAt != null;

  const allTerminal =
    totalItems > 0 &&
    pendingItems === 0 &&
    processingItems === 0 &&
    completedItems + failedItems === totalItems;

  if (
    job.status ===
    INSIGHT_JOB_STATUS.CANCELLED
  ) {
    status =
      INSIGHT_JOB_STATUS.CANCELLED;

    completedAt =
      job.completedAt ?? new Date();
  } else if (allTerminal) {
    status =
      failedItems > 0
        ? INSIGHT_JOB_STATUS.COMPLETED_WITH_ERRORS
        : INSIGHT_JOB_STATUS.COMPLETED;

    startedAt =
      startedAt ?? new Date();

    completedAt =
      job.completedAt ?? new Date();
  } else if (hasStarted) {
    status =
      INSIGHT_JOB_STATUS.PROCESSING;

    startedAt =
      startedAt ?? new Date();
  }

  return tx.insightProcessingJob.update({
    where: {
      id: jobId,
    },
    data: {
      status,
      totalItems,
      pendingItems,
      processingItems,
      completedItems,
      failedItems,
      startedAt,
      completedAt,
    },
  });
}

export async function createInsightProcessingJob(
  input: CreateInsightProcessingJobInput,
) {
  if (
    !Number.isInteger(input.companyId) ||
    input.companyId <= 0
  ) {
    throw new Error(
      "Ógilt fyrirtæki fyrir Innsýn-vinnslu.",
    );
  }

  const jobType =
    input.jobType.trim();

  const processingVersion =
    input.processingVersion.trim();

  const source =
    input.source?.trim() || "SYSTEM";

  if (!jobType) {
    throw new Error(
      "Tegund Innsýn-vinnslu vantar.",
    );
  }

  if (!processingVersion) {
    throw new Error(
      "Vinnsluútgáfu Innsýn vantar.",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const validatedTargets =
        await validateTargets(
          tx,
          input.companyId,
          input.targets,
        );

      const job =
        await tx.insightProcessingJob.create({
          data: {
            companyId: input.companyId,
            requestedById:
              input.requestedById ?? null,
            jobType,
            status:
              INSIGHT_JOB_STATUS.PENDING,
            processingVersion,
            source,
            totalItems:
              validatedTargets.length,
            pendingItems:
              validatedTargets.length,
            processingItems: 0,
            completedItems: 0,
            failedItems: 0,
            metadata:
              input.metadata ?? undefined,
          },
        });

      await tx.insightProcessingItem.createMany({
        data: validatedTargets.map(
          (target) => ({
            jobId: job.id,
            receiptId: target.receiptId,
            documentId:
              target.documentId ?? null,
            itemKey:
              buildItemKey(target),
            status:
              INSIGHT_ITEM_STATUS.PENDING,
            processingVersion,
            attemptCount: 0,
          }),
        ),
      });

      await tx.auditEvent.create({
        data: {
          companyId: input.companyId,
          userId:
            input.requestedById ?? null,
          entityType:
            "InsightProcessingJob",
          entityId: job.id,
          action:
            "CREATE_INSIGHT_PROCESSING_JOB",
          source,
          description:
            `Innsýn-vinnsluverk stofnað með ${validatedTargets.length} skjölum.`,
          afterData: {
            jobType,
            processingVersion,
            totalItems:
              validatedTargets.length,
            status:
              INSIGHT_JOB_STATUS.PENDING,
          },
          metadata:
            input.metadata ?? undefined,
        },
      });

      return tx.insightProcessingJob.findUniqueOrThrow(
        {
          where: {
            id: job.id,
          },
          include: {
            items: {
              orderBy: {
                id: "asc",
              },
            },
          },
        },
      );
    },
  );
}

async function tryClaimNextInsightProcessingItem(
  jobId?: number,
) {
  return prisma.$transaction(
    async (tx) => {
      const candidate =
        await tx.insightProcessingItem.findFirst({
          where: {
            status:
              INSIGHT_ITEM_STATUS.PENDING,

            ...(jobId != null
              ? {
                  jobId,
                }
              : {}),

            job: {
              status: {
                in: [
                  INSIGHT_JOB_STATUS.PENDING,
                  INSIGHT_JOB_STATUS.PROCESSING,
                ],
              },
            },
          },

          orderBy: [
            {
              createdAt: "asc",
            },
            {
              id: "asc",
            },
          ],

          select: {
            id: true,
            jobId: true,
          },
        });

      if (!candidate) {
        return null;
      }

      const now = new Date();

      /*
       * Compare-and-set:
       *
       * Tveir workerar geta séð sama PENDING item
       * á sama augnabliki.
       *
       * Aðeins sá sem nær að breyta stöðunni úr
       * PENDING í PROCESSING fær atriðið.
       */
      const claimed =
        await tx.insightProcessingItem.updateMany({
          where: {
            id: candidate.id,
            status:
              INSIGHT_ITEM_STATUS.PENDING,
          },

          data: {
            status:
              INSIGHT_ITEM_STATUS.PROCESSING,

            startedAt: now,
            completedAt: null,
            lastAttemptAt: now,
            errorMessage: null,

            attemptCount: {
              increment: 1,
            },
          },
        });

      if (claimed.count !== 1) {
        return null;
      }

      await recomputeJobState(
        tx,
        candidate.jobId,
      );

      return tx.insightProcessingItem.findUnique({
        where: {
          id: candidate.id,
        },

        include: {
          job: true,
          receipt: true,
          document: true,
        },
      });
    },
  );
}

export async function claimNextInsightProcessingItem(
  jobId?: number,
) {
  if (
    jobId != null &&
    (!Number.isInteger(jobId) ||
      jobId <= 0)
  ) {
    throw new Error(
      "Ógilt Innsýn-vinnsluverk.",
    );
  }

  /*
   * Ef annar worker vinnur CAS-kapphlaupið
   * reynum við aftur.
   *
   * Þetta kemur í veg fyrir að worker haldi
   * ranglega að biðröðin sé tóm ef fleiri
   * PENDING atriði eru enn til.
   */
  for (
    let attempt = 0;
    attempt < 5;
    attempt += 1
  ) {
    const item =
      await tryClaimNextInsightProcessingItem(
        jobId,
      );

    if (item) {
      return item;
    }

    const pendingExists =
      await prisma.insightProcessingItem.findFirst(
        {
          where: {
            status:
              INSIGHT_ITEM_STATUS.PENDING,

            ...(jobId != null
              ? {
                  jobId,
                }
              : {}),

            job: {
              status: {
                in: [
                  INSIGHT_JOB_STATUS.PENDING,
                  INSIGHT_JOB_STATUS.PROCESSING,
                ],
              },
            },
          },

          select: {
            id: true,
          },
        },
      );

    if (!pendingExists) {
      return null;
    }
  }

  return null;
}

export async function completeInsightProcessingItem(
  input: CompleteInsightProcessingItemInput,
) {
  if (
    !Number.isInteger(input.itemId) ||
    input.itemId <= 0
  ) {
    throw new Error(
      "Ógilt Innsýn-vinnsluatriði.",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const item =
        await tx.insightProcessingItem.findUnique({
          where: {
            id: input.itemId,
          },

          include: {
            job: {
              select: {
                id: true,
                companyId: true,
                requestedById: true,
                source: true,
              },
            },
          },
        });

      if (!item) {
        throw new Error(
          `Innsýn-vinnsluatriði ${input.itemId} fannst ekki.`,
        );
      }

      if (
        item.status !==
        INSIGHT_ITEM_STATUS.PROCESSING
      ) {
        throw new Error(
          `Ekki er hægt að klára Innsýn-vinnsluatriði í stöðunni ${item.status}.`,
        );
      }

      const completedAt =
        new Date();

      const updatedItem =
        await tx.insightProcessingItem.update({
          where: {
            id: item.id,
          },

          data: {
            status:
              INSIGHT_ITEM_STATUS.COMPLETED,
            completedAt,
            errorMessage: null,
            resultMetadata:
              input.resultMetadata ??
              undefined,
          },
        });

      const updatedJob =
        await recomputeJobState(
          tx,
          item.jobId,
        );

      await tx.auditEvent.create({
        data: {
          companyId:
            item.job.companyId,

          userId:
            item.job.requestedById,

          entityType:
            "InsightProcessingItem",

          entityId: item.id,

          action:
            "COMPLETE_INSIGHT_PROCESSING_ITEM",

          parentEntityType:
            "InsightProcessingJob",

          parentEntityId:
            item.jobId,

          source:
            item.job.source,

          description:
            "Innsýn-vinnslu á skjali lokið.",

          beforeData: {
            status: item.status,
          },

          afterData: {
            status:
              INSIGHT_ITEM_STATUS.COMPLETED,

            completedAt:
              completedAt.toISOString(),

            attemptCount:
              item.attemptCount,
          },

          metadata:
            input.resultMetadata ??
            undefined,
        },
      });

      return {
        item: updatedItem,
        job: updatedJob,
      };
    },
  );
}

export async function failInsightProcessingItem(
  input: FailInsightProcessingItemInput,
) {
  if (
    !Number.isInteger(input.itemId) ||
    input.itemId <= 0
  ) {
    throw new Error(
      "Ógilt Innsýn-vinnsluatriði.",
    );
  }

  const errorMessage =
    cleanErrorMessage(
      input.errorMessage,
    );

  return prisma.$transaction(
    async (tx) => {
      const item =
        await tx.insightProcessingItem.findUnique({
          where: {
            id: input.itemId,
          },

          include: {
            job: {
              select: {
                id: true,
                companyId: true,
                requestedById: true,
                source: true,
              },
            },
          },
        });

      if (!item) {
        throw new Error(
          `Innsýn-vinnsluatriði ${input.itemId} fannst ekki.`,
        );
      }

      if (
        item.status !==
        INSIGHT_ITEM_STATUS.PROCESSING
      ) {
        throw new Error(
          `Ekki er hægt að merkja Innsýn-vinnsluatriði sem bilað úr stöðunni ${item.status}.`,
        );
      }

      const completedAt =
        new Date();

      const updatedItem =
        await tx.insightProcessingItem.update({
          where: {
            id: item.id,
          },

          data: {
            status:
              INSIGHT_ITEM_STATUS.FAILED,

            completedAt,
            errorMessage,

            resultMetadata:
              input.resultMetadata ??
              undefined,
          },
        });

      const updatedJob =
        await recomputeJobState(
          tx,
          item.jobId,
        );

      await tx.auditEvent.create({
        data: {
          companyId:
            item.job.companyId,

          userId:
            item.job.requestedById,

          entityType:
            "InsightProcessingItem",

          entityId: item.id,

          action:
            "FAIL_INSIGHT_PROCESSING_ITEM",

          parentEntityType:
            "InsightProcessingJob",

          parentEntityId:
            item.jobId,

          source:
            item.job.source,

          description:
            "Villa kom upp við Innsýn-vinnslu skjals. Önnur skjöl í vinnsluverkinu halda áfram.",

          beforeData: {
            status: item.status,
          },

          afterData: {
            status:
              INSIGHT_ITEM_STATUS.FAILED,

            completedAt:
              completedAt.toISOString(),

            attemptCount:
              item.attemptCount,

            errorMessage,
          },

          metadata:
            input.resultMetadata ??
            undefined,
        },
      });

      return {
        item: updatedItem,
        job: updatedJob,
      };
    },
  );
}


export async function recoverStaleInsightProcessingItems(
  input: RecoverStaleInsightProcessingItemsInput = {},
) {
  const staleAfterMinutes =
    input.staleAfterMinutes ??
    DEFAULT_INSIGHT_STALE_AFTER_MINUTES;

  if (
    !Number.isInteger(staleAfterMinutes) ||
    staleAfterMinutes <= 0
  ) {
    throw new Error(
      "staleAfterMinutes verður að vera jákvæð heiltala.",
    );
  }

  if (
    input.jobId != null &&
    (!Number.isInteger(input.jobId) ||
      input.jobId <= 0)
  ) {
    throw new Error(
      "Ógilt Innsýn-vinnsluverk.",
    );
  }

  const staleBefore = new Date(
    Date.now() -
      staleAfterMinutes * 60 * 1000,
  );

  /*
   * PROCESSING item er talið fast ef síðasta
   * tilraun hófst fyrir staleBefore.
   *
   * Við notum lastAttemptAt fyrst og startedAt
   * sem varaleið fyrir eldri gögn.
   *
   * Recovery setur atriðið aftur í PENDING.
   * attemptCount er EKKI núllstillt; þannig
   * varðveitum við rekjanleika um fyrri tilraun.
   */
  const staleItems =
    await prisma.insightProcessingItem.findMany({
      where: {
        status:
          INSIGHT_ITEM_STATUS.PROCESSING,

        ...(input.jobId != null
          ? {
              jobId: input.jobId,
            }
          : {}),

        job: {
          status: {
            in: [
              INSIGHT_JOB_STATUS.PENDING,
              INSIGHT_JOB_STATUS.PROCESSING,
            ],
          },
        },

        OR: [
          {
            lastAttemptAt: {
              lt: staleBefore,
            },
          },
          {
            lastAttemptAt: null,
            startedAt: {
              lt: staleBefore,
            },
          },
        ],
      },

      orderBy: [
        {
          lastAttemptAt: "asc",
        },
        {
          startedAt: "asc",
        },
        {
          id: "asc",
        },
      ],

      select: {
        id: true,
        jobId: true,
      },
    });

  if (staleItems.length === 0) {
    return {
      staleAfterMinutes,
      staleBefore,
      recoveredItems: 0,
      recoveredItemIds: [] as number[],
      affectedJobIds: [] as number[],
    };
  }

  const recoveredItemIds: number[] = [];
  const affectedJobIds = new Set<number>();

  for (const staleItem of staleItems) {
    await prisma.$transaction(
      async (tx) => {
        /*
         * Compare-and-set kemur í veg fyrir að recovery
         * taki item sem annar worker náði að klára á
         * milli findMany og updateMany.
         */
        const recovered =
          await tx.insightProcessingItem.updateMany({
            where: {
              id: staleItem.id,
              jobId: staleItem.jobId,
              status:
                INSIGHT_ITEM_STATUS.PROCESSING,

              OR: [
                {
                  lastAttemptAt: {
                    lt: staleBefore,
                  },
                },
                {
                  lastAttemptAt: null,
                  startedAt: {
                    lt: staleBefore,
                  },
                },
              ],
            },

            data: {
              status:
                INSIGHT_ITEM_STATUS.PENDING,
              startedAt: null,
              completedAt: null,
              errorMessage: null,
            },
          });

        if (recovered.count !== 1) {
          return;
        }

        const job =
          await tx.insightProcessingJob.findUnique({
            where: {
              id: staleItem.jobId,
            },
            select: {
              id: true,
              companyId: true,
              requestedById: true,
              source: true,
            },
          });

        if (!job) {
          throw new Error(
            `Innsýn-vinnsluverk ${staleItem.jobId} fannst ekki við recovery.`,
          );
        }

        await recomputeJobState(
          tx,
          staleItem.jobId,
        );

        await tx.auditEvent.create({
          data: {
            companyId:
              job.companyId,

            userId:
              job.requestedById,

            entityType:
              "InsightProcessingItem",

            entityId:
              staleItem.id,

            action:
              "RECOVER_STALE_INSIGHT_PROCESSING_ITEM",

            parentEntityType:
              "InsightProcessingJob",

            parentEntityId:
              staleItem.jobId,

            source:
              job.source,

            description:
              "Fast Innsýn-vinnsluatriði sett aftur í bið til endurvinnslu.",

            beforeData: {
              status:
                INSIGHT_ITEM_STATUS.PROCESSING,
              staleBefore:
                staleBefore.toISOString(),
            },

            afterData: {
              status:
                INSIGHT_ITEM_STATUS.PENDING,
            },

            metadata: {
              staleAfterMinutes,
              recoveryReason:
                "PROCESSING_TIMEOUT",
            },
          },
        });

        recoveredItemIds.push(
          staleItem.id,
        );

        affectedJobIds.add(
          staleItem.jobId,
        );
      },
    );
  }

  return {
    staleAfterMinutes,
    staleBefore,
    recoveredItems:
      recoveredItemIds.length,
    recoveredItemIds,
    affectedJobIds:
      Array.from(affectedJobIds),
  };
}

export async function retryInsightProcessingItem(
  itemId: number,
) {
  if (
    !Number.isInteger(itemId) ||
    itemId <= 0
  ) {
    throw new Error(
      "Ógilt Innsýn-vinnsluatriði.",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const item =
        await tx.insightProcessingItem.findUnique({
          where: {
            id: itemId,
          },

          include: {
            job: {
              select: {
                id: true,
                companyId: true,
                requestedById: true,
                source: true,
                status: true,
              },
            },
          },
        });

      if (!item) {
        throw new Error(
          `Innsýn-vinnsluatriði ${itemId} fannst ekki.`,
        );
      }

      if (
        item.status !==
        INSIGHT_ITEM_STATUS.FAILED
      ) {
        throw new Error(
          `Aðeins er hægt að reyna aftur vinnsluatriði sem er í FAILED stöðu. Núverandi staða er ${item.status}.`,
        );
      }

      if (
        item.job.status ===
        INSIGHT_JOB_STATUS.CANCELLED
      ) {
        throw new Error(
          "Ekki er hægt að endurræsa atriði í vinnsluverki sem hefur verið hætt við.",
        );
      }

      const updatedItem =
        await tx.insightProcessingItem.update({
          where: {
            id: item.id,
          },

          data: {
            status:
              INSIGHT_ITEM_STATUS.PENDING,

            startedAt: null,
            completedAt: null,
            errorMessage: null,
          },
        });

      /*
       * Ef vinnsluverkið hafði lokið með villum
       * verður það aftur virkt þegar FAILED item
       * er sett aftur í bið.
       */
      await tx.insightProcessingJob.update({
        where: {
          id: item.jobId,
        },

        data: {
          status:
            INSIGHT_JOB_STATUS.PROCESSING,

          completedAt: null,
        },
      });

      const updatedJob =
        await recomputeJobState(
          tx,
          item.jobId,
        );

      await tx.auditEvent.create({
        data: {
          companyId:
            item.job.companyId,

          userId:
            item.job.requestedById,

          entityType:
            "InsightProcessingItem",

          entityId: item.id,

          action:
            "RETRY_INSIGHT_PROCESSING_ITEM",

          parentEntityType:
            "InsightProcessingJob",

          parentEntityId:
            item.jobId,

          source:
            item.job.source,

          description:
            "Innsýn-vinnsluatriði sett aftur í bið til endurvinnslu.",

          beforeData: {
            status:
              item.status,

            errorMessage:
              item.errorMessage,

            attemptCount:
              item.attemptCount,
          },

          afterData: {
            status:
              INSIGHT_ITEM_STATUS.PENDING,

            attemptCount:
              item.attemptCount,
          },
        },
      });

      return {
        item: updatedItem,
        job: updatedJob,
      };
    },
  );
}

export async function getInsightProcessingJob(
  jobId: number,
) {
  if (
    !Number.isInteger(jobId) ||
    jobId <= 0
  ) {
    throw new Error(
      "Ógilt Innsýn-vinnsluverk.",
    );
  }

  return prisma.insightProcessingJob.findUnique({
    where: {
      id: jobId,
    },

    include: {
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },

      items: {
        orderBy: {
          id: "asc",
        },

        include: {
          receipt: {
            select: {
              id: true,
              date: true,
              description: true,
              amount: true,
              fileName: true,
            },
          },

          document: {
            select: {
              id: true,
              merchantName: true,
              date: true,
              totalAmount: true,
              documentType: true,
              documentRole: true,
              disposition: true,
            },
          },
        },
      },
    },
  });
}