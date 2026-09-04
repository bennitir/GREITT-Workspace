import { prisma } from "@/lib/prisma";

import {
  analyzeDocumentForInsight,
  type InsightDocumentAnalysisResult,
} from "@/lib/insight/document-analyzer";

import {
  claimNextInsightProcessingItem,
  completeInsightProcessingItem,
  failInsightProcessingItem,
  recoverStaleInsightProcessingItems,
} from "@/lib/insight/processing-service";

type ProcessNextInsightItemOptions = {
  jobId?: number;
};

type RunInsightWorkerOptions = {
  jobId?: number;
  maxItems?: number;
};

function cleanWorkerError(
  error: unknown,
) {
  if (error instanceof Error) {
    return error.message.slice(0, 4000);
  }

  if (typeof error === "string") {
    return error.slice(0, 4000);
  }

  return "Óþekkt villa í Innsýn-worker.";
}

function parseOptionalDate(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const parsed = new Date(
    `${value}T00:00:00.000Z`,
  );

  if (
    Number.isNaN(parsed.getTime())
  ) {
    return null;
  }

  return parsed;
}

function buildSemanticSource(
  processingVersion: string,
) {
  return `AI_INNSYN:${processingVersion}`;
}

async function findOrCreateInsightEntity(
  tx: Parameters<
    Parameters<
      typeof prisma.$transaction
    >[0]
  >[0],
  input: {
    companyId: number;
    processingVersion: string;
    processingItemId: number;

    entity: {
      entityType: string;
      name: string;
      identifierType: string | null;
      identifierValue: string | null;
      confidence: number;
    };
  },
) {
  const {
    companyId,
    processingVersion,
    processingItemId,
    entity,
  } = input;

  /*
   * Sterkt auðkenni hefur forgang.
   *
   * Dæmi:
   * LOAN + LOAN_NUMBER + 104907
   * VEHICLE + REGISTRATION_NUMBER + ABC12
   */
  if (
    entity.identifierType &&
    entity.identifierValue
  ) {
    const existing =
      await tx.insightEntity.findFirst({
        where: {
          companyId,
          entityType:
            entity.entityType,
          identifierType:
            entity.identifierType,
          identifierValue:
            entity.identifierValue,
          status: "ACTIVE",
        },
      });

    if (existing) {
      return existing;
    }
  }

  /*
   * Ef sterkt auðkenni vantar reynum við
   * mjög varfærna nákvæma samsvörun á
   * entityType + name.
   *
   * Við reynum ekki fuzzy matching hér.
   */
  const existingByName =
    await tx.insightEntity.findFirst({
      where: {
        companyId,
        entityType:
          entity.entityType,
        name: entity.name,
        status: "ACTIVE",
      },
    });

  if (existingByName) {
    return existingByName;
  }

  /*
   * AI má greina einingu en má ekki staðfesta
   * tengsl hennar við fyrirtækið/notandann.
   */
  return tx.insightEntity.create({
    data: {
      companyId,
      entityType:
        entity.entityType,
      name: entity.name,
      status: "ACTIVE",

      identifierType:
        entity.identifierType,

      identifierValue:
        entity.identifierValue,

      relationshipStatus:
        "UNCONFIRMED",

      metadata: {
        source:
          buildSemanticSource(
            processingVersion,
          ),

        processingVersion,
        firstSeenProcessingItemId:
          processingItemId,

        aiConfidence:
          entity.confidence,
      },
    },
  });
}

async function persistInsightAnalysis(
  input: {
    companyId: number;
    requestedById:
      | number
      | null;
    jobId: number;
    itemId: number;
    receiptId: number;
    documentId:
      | number
      | null;
    processingVersion: string;
    analysis:
      InsightDocumentAnalysisResult;
  },
) {
  const {
    companyId,
    requestedById,
    jobId,
    itemId,
    receiptId,
    documentId,
    processingVersion,
    analysis,
  } = input;

  const source =
    buildSemanticSource(
      processingVersion,
    );

  return prisma.$transaction(
    async (tx) => {
      /*
       * ENDURVINNSLA
       *
       * Ef sama processingVersion er keyrt aftur
       * á sama skjal eigum við ekki að safna
       * tvöföldum AI-staðreyndum.
       *
       * Við eyðum AÐEINS gögnum sem þessi
       * Innsýn-útgáfa hefur sjálf búið til.
       *
       * Við snertum ekki:
       * - bókun,
       * - voucherNumber,
       * - disposition,
       * - staðfest tengsl,
       * - eða semantic gögn frá öðrum source.
       */
      await tx.insightFact.deleteMany({
        where: {
          companyId,
          receiptId,
          documentId,
          source,
        },
      });

      await tx.documentEntityLink.deleteMany({
        where: {
          receiptId,
          documentId,
          source,
        },
      });

      let entityLinkCount = 0;

      for (
        const detectedEntity
        of analysis.entities
      ) {
        const entity =
          await findOrCreateInsightEntity(
            tx,
            {
              companyId,
              processingVersion,
              processingItemId:
                itemId,

              entity: {
                entityType:
                  detectedEntity.entityType,

                name:
                  detectedEntity.name,

                identifierType:
                  detectedEntity.identifierType,

                identifierValue:
                  detectedEntity.identifierValue,

                confidence:
                  detectedEntity.confidence,
              },
            },
          );

        /*
         * Ekki yfirskrifa eldri eða staðfest
         * DocumentEntityLink ef sama tenging
         * er þegar til frá öðrum source.
         */
        const existingLink =
          await tx.documentEntityLink.findFirst({
            where: {
              receiptId,
              documentId,
              entityId:
                entity.id,
              role:
                detectedEntity.role,
            },
          });

        if (!existingLink) {
          await tx.documentEntityLink.create({
            data: {
              receiptId,
              documentId,
              entityId:
                entity.id,

              role:
                detectedEntity.role,

              confidence:
                detectedEntity.confidence,

              source,
            },
          });

          entityLinkCount += 1;
        }
      }

      let factCount = 0;

      for (
        const fact
        of analysis.facts
      ) {
        await tx.insightFact.create({
          data: {
            companyId,
            receiptId,
            documentId,

            /*
             * Við tengjum staðreynd ekki sjálfkrafa
             * við entity eða FinancialEvent fyrr en
             * örugg samsvörun er til.
             */
            entityId: null,
            eventId: null,

            factType:
              fact.factType,

            label:
              fact.label,

            numberValue:
              fact.valueNumber,

            textValue:
              fact.valueText,

            dateValue:
              parseOptionalDate(
                fact.valueDate,
              ),

            booleanValue:
              null,

            unit:
              fact.unit,

            currency: null,

            periodStart:
              parseOptionalDate(
                fact.periodStart,
              ),

            periodEnd:
              parseOptionalDate(
                fact.periodEnd,
              ),

            confidence:
              fact.confidence,

            source,

            metadata: {
              processingVersion,
              processingItemId:
                itemId,
            },
          },
        });

        factCount += 1;
      }

      /*
       * FinancialEventCandidate er vísvitandi
       * EKKI breytt í FinancialEvent hér.
       *
       * Áður þarf matching-lag sem getur
       * ákvarðað hvort:
       *
       * reikningur
       * greiðsluseðill
       * greiðslustaðfesting
       * bankahreyfing
       *
       * lýsi sama fjárhagsatburði.
       *
       * Þangað til er candidate varðveitt
       * í resultMetadata vinnsluatriðisins.
       */

      await tx.auditEvent.create({
        data: {
          companyId,

          userId:
            requestedById,

          entityType:
            documentId != null
              ? "AiDetectedDocument"
              : "Receipt",

          entityId:
            documentId ??
            receiptId,

          action:
            "PERSIST_INSIGHT_ANALYSIS",

          parentEntityType:
            "InsightProcessingJob",

          parentEntityId:
            jobId,

          source,

          description:
            "Innsýn-greining varðveitt án breytinga á bókun.",

          metadata: {
            processingVersion,
            processingItemId:
              itemId,

            detectedEntities:
              analysis.entities.length,

            createdEntityLinks:
              entityLinkCount,

            insightFacts:
              factCount,

            hasFinancialEventCandidate:
              analysis.financialEventCandidate !==
              null,
          },
        },
      });

      return {
        entityLinkCount,
        factCount,
      };
    },
  );
}

export async function processNextInsightItem(
  options: ProcessNextInsightItemOptions = {},
) {
  const item =
    await claimNextInsightProcessingItem(
      options.jobId,
    );

  if (!item) {
    return {
      processed: false as const,
      item: null,
    };
  }

  try {
    if (
      !item.receipt.filePath &&
      !item.receipt.storagePath
    ) {
      throw new Error(
        `Fylgiskjal ${item.receiptId} er ekki með tengt frumskjal.`,
      );
    }

    const company =
      await prisma.company.findUnique({
        where: {
          id: item.job.companyId,
        },

        select: {
          id: true,
          name: true,
          vatNumber: true,
          vatRegistered: true,
          rskRegisteredActivities:
            true,
          activeActivities: true,
        },
      });

    if (!company) {
      throw new Error(
        `Fyrirtæki ${item.job.companyId} fannst ekki.`,
      );
    }

    /*
     * Öryggisvörn gegn því að job/item
     * fari óvart yfir fyrirtækjamörk.
     */
    if (
      item.receipt.companyId !==
      company.id
    ) {
      throw new Error(
        "Innsýn-vinnsluatriði og fylgiskjal tilheyra ekki sama fyrirtæki.",
      );
    }

    if (
      item.document &&
      item.document.receiptId !==
        item.receiptId
    ) {
      throw new Error(
        "Greint skjal tilheyrir ekki réttu fylgiskjali.",
      );
    }

    const analysis =
      await analyzeDocumentForInsight({
        filePath:
          item.receipt.filePath ?? "",

        storagePath:
          item.receipt.storagePath,

        processingVersion:
          item.processingVersion,

        company: {
          name:
            company.name,

          vatNumber:
            company.vatNumber,

          vatRegistered:
            company.vatRegistered,

          rskRegisteredActivities:
            company.rskRegisteredActivities,

          activeActivities:
            company.activeActivities,
        },

        existingDocument:
          item.document
            ? {
                documentId:
                  item.document.id,

                pageNumber:
                  item.document.pageNumber,

                merchantName:
                  item.document.merchantName,

                merchantKennitala:
                  item.document.merchantKennitala,

                date:
                  item.document.date,

                receiptNumber:
                  item.document.receiptNumber,

                totalAmount:
                  item.document.totalAmount,

                summary:
                  item.document.summary,

                documentType:
                  item.document.documentType,

                documentRole:
                  item.document.documentRole,
              }
            : null,
      });

    const persisted =
      await persistInsightAnalysis({
        companyId:
          company.id,

        requestedById:
          item.job.requestedById,

        jobId:
          item.jobId,

        itemId:
          item.id,

        receiptId:
          item.receiptId,

        documentId:
          item.documentId,

        processingVersion:
          item.processingVersion,

        analysis,
      });

    const completion =
      await completeInsightProcessingItem({
        itemId:
          item.id,

        resultMetadata: {
          processingVersion:
            analysis.processingVersion,

          document: {
            merchantName:
              analysis.document.merchantName,

            merchantKennitala:
              analysis.document.merchantKennitala,

            date:
              analysis.document.date,

            receiptNumber:
              analysis.document.receiptNumber,

            totalAmount:
              analysis.document.totalAmount,

            pageNumber:
              analysis.document.pageNumber,

            summary:
              analysis.document.summary,

            documentType:
              analysis.document.documentType,

            documentRole:
              analysis.document.documentRole,

            classificationConfidence:
              analysis.document
                .classificationConfidence,
          },

          entities:
            analysis.entities.map(
              (entity) => ({
                entityType:
                  entity.entityType,

                name:
                  entity.name,

                identifierType:
                  entity.identifierType,

                identifierValue:
                  entity.identifierValue,

                role:
                  entity.role,

                confidence:
                  entity.confidence,
              }),
            ),

          facts:
            analysis.facts.map(
              (fact) => ({
                factType:
                  fact.factType,

                label:
                  fact.label,

                valueText:
                  fact.valueText,

                valueNumber:
                  fact.valueNumber,

                valueDate:
                  fact.valueDate,

                unit:
                  fact.unit,

                periodStart:
                  fact.periodStart,

                periodEnd:
                  fact.periodEnd,

                confidence:
                  fact.confidence,
              }),
            ),

          financialEventCandidate:
            analysis.financialEventCandidate
              ? {
                  eventType:
                    analysis
                      .financialEventCandidate
                      .eventType,

                  description:
                    analysis
                      .financialEventCandidate
                      .description,

                  date:
                    analysis
                      .financialEventCandidate
                      .date,

                  amount:
                    analysis
                      .financialEventCandidate
                      .amount,

                  currency:
                    analysis
                      .financialEventCandidate
                      .currency,

                  confidence:
                    analysis
                      .financialEventCandidate
                      .confidence,
                }
              : null,

          persisted: {
            entityLinks:
              persisted.entityLinkCount,

            facts:
              persisted.factCount,
          },

          usage: {
            model:
              analysis.usage.model,

            inputTokens:
              analysis.usage.inputTokens,

            cachedInputTokens:
              analysis.usage
                .cachedInputTokens,

            outputTokens:
              analysis.usage.outputTokens,

            totalTokens:
              analysis.usage.totalTokens,
          },
        },
      });

    return {
      processed: true as const,
      success: true as const,

      itemId:
        item.id,

      jobId:
        item.jobId,

      analysis,
      persisted,
      completion,
    };
  } catch (error) {
    const errorMessage =
      cleanWorkerError(error);

    try {
      const failure =
        await failInsightProcessingItem({
          itemId:
            item.id,

          errorMessage,

          resultMetadata: {
            processingVersion:
              item.processingVersion,

            workerError:
              errorMessage,
          },
        });

      return {
        processed: true as const,
        success: false as const,

        itemId:
          item.id,

        jobId:
          item.jobId,

        error:
          errorMessage,

        failure,
      };
    } catch (
      failureError
    ) {
      /*
       * Ef jafnvel skráning FAILED stöðu bregst
       * eigum við að kasta villunni áfram.
       *
       * Þá liggur item áfram í gagnagrunni og
       * má greina sem fast/stale PROCESSING
       * síðar.
       */
      const failureMessage =
        cleanWorkerError(
          failureError,
        );

      throw new Error(
        `${errorMessage} Ekki tókst heldur að merkja vinnsluatriðið FAILED: ${failureMessage}`,
      );
    }
  }
}

export async function runInsightWorker(
  options: RunInsightWorkerOptions = {},
) {
  const maxItems =
    options.maxItems ?? 1;

  if (
    !Number.isInteger(maxItems) ||
    maxItems <= 0
  ) {
    throw new Error(
      "maxItems verður að vera jákvæð heiltala.",
    );
  }

  /*
   * Endurheimtum fyrst PROCESSING atriði sem hafa
   * setið föst lengur en stale-mörkin.
   *
   * Þetta gerist áður en worker claim-ar næsta item.
   */
  const recovery =
    await recoverStaleInsightProcessingItems({
      jobId: options.jobId,
    });

  const results: Awaited<
    ReturnType<
      typeof processNextInsightItem
    >
  >[] = [];

  for (
    let index = 0;
    index < maxItems;
    index += 1
  ) {
    const result =
      await processNextInsightItem({
        jobId:
          options.jobId,
      });

    results.push(result);

    if (!result.processed) {
      break;
    }

    /*
     * Villa í einu skjali stöðvar ekki bunkann.
     *
     * Næsta item er tekið óháð success/failure.
     */
  }

  return {
    recovery,

    processedItems:
      results.filter(
        (result) =>
          result.processed,
      ).length,

    succeededItems:
      results.filter(
        (result) =>
          result.processed &&
          "success" in result &&
          result.success === true,
      ).length,

    failedItems:
      results.filter(
        (result) =>
          result.processed &&
          "success" in result &&
          result.success === false,
      ).length,

    results,
  };
}