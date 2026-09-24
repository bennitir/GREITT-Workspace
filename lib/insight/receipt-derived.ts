import { prisma } from "@/lib/prisma";
import { RECEIPT_PROCESSING_VERSION } from "@/lib/receipts/ingestion";
import { resolveCanonicalInsightEntity } from "@/lib/insight/entity-identity";

export const RECEIPT_DERIVED_INSIGHT_SOURCE =
  `RECEIPT_EXTRACTION:${RECEIPT_PROCESSING_VERSION}`;

function normalizeKennitala(value: string | null) {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return /^\d{10}$/.test(normalized) ? normalized : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Venjulegt bókhaldsskjal þarf ekki annað vision-AI kall bara til þess að
 * Innsýn fái þær staðreyndir sem fylgiskjalagreiningin er þegar búin að lesa.
 * Þetta lag varðveitir einfaldar canonical staðreyndir og sterka entity-tengingu
 * án þess að gera nýja faglega ályktun.
 */
export async function persistReceiptDerivedInsight(documentId: number) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: {
        select: {
          id: true,
          companyId: true,
          processingVersion: true,
        },
      },
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  const companyId = document.receipt.companyId;
  const receiptId = document.receiptId;
  const source = RECEIPT_DERIVED_INSIGHT_SOURCE;

  return prisma.$transaction(async (tx) => {
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

    // Sterk tvíteknivísbending er biðstaða, ekki ný fjárhagsstaðreynd.
    // Við hreinsum afleidd gögn og bíðum eftir notandastaðfestingu áður
    // en skjalið fær aftur að leggja sjálfstæðar staðreyndir inn í Innsýn.
    if (
      document.duplicateMarkedAt ||
      document.disposition === "DUPLICATE_RESOLVED"
    ) {
      await tx.aiDetectedDocument.update({
        where: { id: documentId },
        data: {
          insightMode: null,
        },
      });

      return {
        factCount: 0,
        merchantEntityId: null,
      };
    }

    const facts: Array<{
      factType: string;
      label: string;
      numberValue?: number;
      textValue?: string;
      dateValue?: Date;
      confidence?: number | null;
      metadata?: Record<string, unknown>;
    }> = [];

    if (document.date) {
      facts.push({
        factType: "DOCUMENT_DATE",
        label: "Dagsetning skjals",
        dateValue: document.date,
        confidence: document.classificationConfidence,
      });
    }

    if (document.totalAmount !== null) {
      facts.push({
        factType: "DOCUMENT_TOTAL",
        label: "Heildarfjárhæð skjals",
        numberValue: document.totalAmount,
        confidence: document.classificationConfidence,
        metadata: { currency: "ISK" },
      });
    }

    if (document.receiptNumber?.trim()) {
      facts.push({
        factType: "DOCUMENT_REFERENCE",
        label: "Reiknings-/skjalanúmer",
        textValue: document.receiptNumber.trim(),
        confidence: document.classificationConfidence,
      });
    }

    if (document.documentType) {
      facts.push({
        factType: "DOCUMENT_TYPE",
        label: "Skjalategund",
        textValue: document.documentType,
        confidence: document.classificationConfidence,
      });
    }

    if (document.documentRole) {
      facts.push({
        factType: "DOCUMENT_ROLE",
        label: "Hlutverk skjals",
        textValue: document.documentRole,
        confidence: document.classificationConfidence,
      });
    }

    if (document.summary?.trim()) {
      facts.push({
        factType: "DOCUMENT_SUMMARY",
        label: "Samantekt úr fylgiskjalslestri",
        textValue: document.summary.trim(),
        confidence: document.classificationConfidence,
      });
    }

    const extractionMetadata = asObject(document.extractionMetadata);
    const canonicalExtraction = asObject(extractionMetadata?.canonicalExtraction);
    const loanInfo = asObject(canonicalExtraction?.loanInfo);
    const insuranceInfo = asObject(canonicalExtraction?.insuranceInfo);

    const loanNumber = asNonEmptyString(loanInfo?.loanNumber);
    const collectionLetterNumber = asNonEmptyString(loanInfo?.collectionLetterNumber);
    const lenderName = asNonEmptyString(loanInfo?.lenderName);
    const principalAmount = asFiniteNumber(loanInfo?.principalAmount);

    if (lenderName) {
      facts.push({
        factType: "LOAN_LENDER",
        label: "Lánveitandi",
        textValue: lenderName,
        confidence: document.classificationConfidence,
      });
    }

    if (loanNumber) {
      facts.push({
        factType: "LOAN_NUMBER",
        label: "Lánsnúmer",
        textValue: loanNumber,
        confidence: document.classificationConfidence,
      });
    }

    if (collectionLetterNumber) {
      facts.push({
        factType: "COLLECTION_LETTER_NUMBER",
        label: "Innheimtubréfsnúmer",
        textValue: collectionLetterNumber,
        confidence: document.classificationConfidence,
      });
    }

    if (principalAmount !== null) {
      facts.push({
        factType: "LOAN_PRINCIPAL",
        label: "Höfuðstóll / afborgun höfuðstóls",
        numberValue: principalAmount,
        confidence: document.classificationConfidence,
        metadata: { currency: "ISK" },
      });
    }

    const insurerName = asNonEmptyString(insuranceInfo?.insurerName);
    const policyNumber = asNonEmptyString(insuranceInfo?.policyNumber);
    const insuranceType = asNonEmptyString(insuranceInfo?.insuranceType);

    if (insurerName) {
      facts.push({
        factType: "INSURER",
        label: "Tryggingafélag",
        textValue: insurerName,
        confidence: document.classificationConfidence,
      });
    }

    if (policyNumber) {
      facts.push({
        factType: "INSURANCE_POLICY_NUMBER",
        label: "Skírteinisnúmer",
        textValue: policyNumber,
        confidence: document.classificationConfidence,
      });
    }

    if (insuranceType) {
      facts.push({
        factType: "INSURANCE_TYPE",
        label: "Tegund tryggingar",
        textValue: insuranceType,
        confidence: document.classificationConfidence,
      });
    }

    const paymentSchedule = asObject(document.paymentSchedule);
    if (paymentSchedule) {
      const scheduleType = asNonEmptyString(paymentSchedule.scheduleType);
      const totalAmount = asFiniteNumber(paymentSchedule.totalAmount);
      const currency = asNonEmptyString(paymentSchedule.currency) ?? "ISK";

      if (scheduleType) {
        facts.push({
          factType: "PAYMENT_SCHEDULE_TYPE",
          label: "Tegund greiðsluáætlunar",
          textValue: scheduleType,
          confidence: document.classificationConfidence,
        });
      }

      if (totalAmount !== null) {
        facts.push({
          factType: "PAYMENT_SCHEDULE_TOTAL",
          label: "Heildarskuldbinding samkvæmt greiðsluáætlun",
          numberValue: totalAmount,
          confidence: document.classificationConfidence,
          metadata: { currency },
        });
      }

      const installments = Array.isArray(paymentSchedule.installments)
        ? paymentSchedule.installments
        : [];

      for (const rawInstallment of installments.slice(0, 60)) {
        const installment = asObject(rawInstallment);
        const amount = asFiniteNumber(installment?.amount);
        const dueDate = asNonEmptyString(installment?.dueDate);
        if (amount === null || !dueDate) continue;

        const parsedDueDate = new Date(dueDate);
        facts.push({
          factType: "PAYMENT_SCHEDULE_INSTALLMENT",
          label: "Gjalddagi samkvæmt greiðsluáætlun",
          numberValue: amount,
          dateValue: Number.isNaN(parsedDueDate.getTime()) ? undefined : parsedDueDate,
          confidence: document.classificationConfidence,
          metadata: {
            currency,
            sequence: asFiniteNumber(installment?.sequence),
            externalReference: asNonEmptyString(installment?.externalReference),
          },
        });
      }
    }

    for (const fact of facts) {
      await tx.insightFact.create({
        data: {
          companyId,
          receiptId,
          documentId,
          factType: fact.factType,
          label: fact.label,
          numberValue: fact.numberValue,
          textValue: fact.textValue,
          dateValue: fact.dateValue,
          confidence: fact.confidence ?? null,
          source,
          metadata: {
            processingVersion:
              document.receipt.processingVersion ?? RECEIPT_PROCESSING_VERSION,
            derivedFrom: "RECEIPT_ANALYSIS",
            ...(fact.metadata ?? {}),
          },
        },
      });
    }

    const merchantKennitala = normalizeKennitala(document.merchantKennitala);
    let merchantEntityId: number | null = null;

    if (merchantKennitala && document.merchantName?.trim()) {
      const resolvedEntity = await resolveCanonicalInsightEntity(tx, {
        companyId,
        entityType: "ORGANIZATION",
        name: document.merchantName.trim(),
        identifierType: "KENNITALA",
        identifierValue: merchantKennitala,
        relationshipStatus: "UNCONFIRMED",
        metadata: {
          source,
          firstSeenReceiptId: receiptId,
          firstSeenDocumentId: documentId,
        },
      });
      const entity = resolvedEntity.entity;

      merchantEntityId = entity.id;

      const existingIssuerLink = await tx.documentEntityLink.findFirst({
        where: {
          documentId,
          entityId: entity.id,
          role: "ISSUER",
        },
        select: { id: true },
      });

      if (!existingIssuerLink) {
        await tx.documentEntityLink.create({
          data: {
            receiptId,
            documentId,
            entityId: entity.id,
            role: "ISSUER",
            confidence: document.classificationConfidence,
            source,
          },
        });
      }
    }

    await tx.aiDetectedDocument.update({
      where: { id: documentId },
      data: {
        insightMode: "RECEIPT_DERIVED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId,
        entityType: "AiDetectedDocument",
        entityId: documentId,
        action: "PERSIST_RECEIPT_DERIVED_INSIGHT",
        parentEntityType: "Receipt",
        parentEntityId: receiptId,
        source: "SYSTEM",
        description:
          "Innsýn-staðreyndir varðveittar úr þegar lesnum fylgiskjalsgögnum án annars AI-lesturs á frumskjalinu.",
        metadata: {
          source,
          factCount: facts.length,
          merchantEntityId,
        },
      },
    });

    return {
      factCount: facts.length,
      merchantEntityId,
    };
  });
}
