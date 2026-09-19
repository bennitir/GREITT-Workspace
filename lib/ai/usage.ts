import { prisma } from "@/lib/prisma";

export const DEFAULT_USD_ISK_RATE = 122.94;

export type OpenAiTokenUsage = {
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
};

export type AiCostBreakdown = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costIsk: number;
  usdIskRate: number;
};

/**
 * Sameiginleg kostnaðarforsenda fyrir GPT-5.6 í GLÖGGT.
 *
 * Verðin eru geymd á einum stað svo Banki, Fylgiskjöl, Innsýn og þýðingar
 * reikni kostnað með sömu forsendum. Ef verð breytast þarf aðeins að breyta
 * þessu lagi; hver AiUsage-færsla varðveitir samt notað gengi og reiknaðan
 * kostnað eins og hann var þegar kallið fór fram.
 */
export function calculateGpt56Cost(
  usage: OpenAiTokenUsage,
  usdIskRate = DEFAULT_USD_ISK_RATE,
): AiCostBreakdown {
  const inputTokens = Math.max(0, usage.inputTokens ?? 0);
  const cachedInputTokens = Math.max(
    0,
    Math.min(inputTokens, usage.cachedInputTokens ?? 0),
  );
  const outputTokens = Math.max(0, usage.outputTokens ?? 0);
  const totalTokens = Math.max(
    0,
    usage.totalTokens ?? inputTokens + outputTokens,
  );
  const uncachedInputTokens = Math.max(
    inputTokens - cachedInputTokens,
    0,
  );

  const costUsd =
    (uncachedInputTokens / 1_000_000) * 5 +
    (cachedInputTokens / 1_000_000) * 0.5 +
    (outputTokens / 1_000_000) * 30;

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    costIsk: costUsd * usdIskRate,
    usdIskRate,
  };
}

export async function recordAiUsage(input: {
  companyId?: number | null;
  userId?: number | null;
  receiptId?: number | null;
  action: string;
  pipelineStage: string;
  operationKey?: string | null;
  model: string;
  usage?: OpenAiTokenUsage;
  durationMs?: number | null;
  success?: boolean;
  errorMessage?: string | null;
  metadata?: any;
  usdIskRate?: number;
}) {
  const cost = calculateGpt56Cost(
    input.usage ?? {},
    input.usdIskRate ?? DEFAULT_USD_ISK_RATE,
  );

  return prisma.aiUsage.create({
    data: {
      companyId: input.companyId ?? null,
      userId: input.userId ?? null,
      receiptId: input.receiptId ?? null,
      action: input.action,
      pipelineStage: input.pipelineStage,
      operationKey: input.operationKey ?? null,
      model: input.model,
      inputTokens: cost.inputTokens,
      cachedInputTokens: cost.cachedInputTokens,
      outputTokens: cost.outputTokens,
      totalTokens: cost.totalTokens,
      costUsd: cost.costUsd,
      costIsk: cost.costIsk,
      usdIskRate: cost.usdIskRate,
      durationMs: input.durationMs ?? null,
      success: input.success ?? true,
      errorMessage: input.errorMessage ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}
