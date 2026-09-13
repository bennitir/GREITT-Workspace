"use server";

import OpenAI from "openai";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { buildBankSubpattern, analyzeBankTransaction, parseRawBankData } from "@/app/banki/_lib/analysis/transactions";

export type BankAiProposal = {
  ok: boolean;
  error?: string;
  title?: string;
  summary?: string;
  suggestedCategory?: string;
  rationale?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  needsHumanDecision?: boolean;
  questions?: string[];
  sampleCount?: number;
  totalGroupCount?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costIsk?: number;
  costUsd?: number;
  fromCache?: boolean;
  matchedReceiptCount?: number;
  analyzedAt?: string;
};

export type BankAiState = BankAiProposal | null;

function cleanJson(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

async function context(bankAccountId: number) {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const companyId = Number(store.get("activeCompanyId")?.value);
  if (!token || !Number.isInteger(companyId) || companyId < 1) throw new Error("Aðgangur rann út.");

  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) throw new Error("Aðgangur rann út.");
  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({ where: { userId_companyId: { userId: session.user.id, companyId } } });
    if (!access?.isActive) throw new Error("Enginn aðgangur að fyrirtæki.");
  }
  const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId, isActive: true } });
  if (!account) throw new Error("Bankareikningur fannst ekki.");
  return { companyId, userId: session.user.id, account };
}


function groupFingerprint(group: Array<{ id: number; fingerprint: string | null; updatedAt: Date }>) {
  const stable = group
    .map((item) => `${item.id}:${item.fingerprint ?? ""}:${item.updatedAt.toISOString()}`)
    .sort()
    .join("|");
  return createHash("sha256").update(stable).digest("hex");
}

function proposalFromCache(cache: {
  resultJson: string; sampleCount: number; totalGroupCount: number; matchedReceiptCount: number;
  inputTokens: number; cachedInputTokens: number; outputTokens: number; totalTokens: number;
  costIsk: number; costUsd: number; createdAt: Date;
}): BankAiProposal {
  const parsed = JSON.parse(cache.resultJson);
  return {
    ok: true,
    title: String(parsed.title ?? "AI-greining"), summary: String(parsed.summary ?? ""),
    suggestedCategory: String(parsed.suggestedCategory ?? "óákveðið"), rationale: String(parsed.rationale ?? ""),
    confidence: ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence) ? parsed.confidence : "LOW",
    needsHumanDecision: parsed.needsHumanDecision !== false,
    questions: Array.isArray(parsed.questions) ? parsed.questions.map(String).slice(0, 5) : [],
    sampleCount: cache.sampleCount, totalGroupCount: cache.totalGroupCount,
    inputTokens: cache.inputTokens, cachedInputTokens: cache.cachedInputTokens,
    outputTokens: cache.outputTokens, totalTokens: cache.totalTokens,
    costIsk: cache.costIsk, costUsd: cache.costUsd,
    matchedReceiptCount: cache.matchedReceiptCount,
    fromCache: true, analyzedAt: cache.createdAt.toISOString(),
  };
}

export async function analyzeBankSubpatternWithAI(_previous: BankAiState, formData: FormData): Promise<BankAiProposal> {
  const started = Date.now();
  const bankAccountId = Number(formData.get("bankAccountId"));
  const patternKey = String(formData.get("patternKey") ?? "");
  const subpatternKey = String(formData.get("subpatternKey") ?? "");
  let companyId: number | undefined;
  let userId: number | undefined;

  try {
    if (!Number.isInteger(bankAccountId) || bankAccountId < 1 || !patternKey || !subpatternKey) throw new Error("Ógild greiningarbeiðni.");
    const ctx = await context(bankAccountId);
    companyId = ctx.companyId;
    userId = ctx.userId;

    const transactions = await prisma.bankTransaction.findMany({ where: { bankAccountId }, orderBy: [{ date: "desc" }, { id: "desc" }] });
    const group = transactions.filter((transaction) => {
      const amount = Number(transaction.amount);
      const analysis = analyzeBankTransaction({ text: transaction.text, amount, sourceRawData: transaction.sourceRawData });
      if (analysis.patternKey !== patternKey) return false;
      return buildBankSubpattern({ text: transaction.text, amount, sourceRawData: transaction.sourceRawData }).key === subpatternKey;
    });
    if (!group.length) throw new Error("Undirmynstrið fannst ekki.");

    const fingerprint = groupFingerprint(group);
    const forceReanalysis = String(formData.get("forceReanalysis") ?? "") === "true";
    if (!forceReanalysis) {
      const cached = await prisma.bankAiAnalysisCache.findUnique({
        where: { bankAccountId_patternKey_subpatternKey_groupFingerprint: { bankAccountId, patternKey, subpatternKey, groupFingerprint: fingerprint } },
      });
      if (cached) return proposalFromCache(cached);
    }

    // Search existing company documents before paying for AI. These are candidates only;
    // a matching amount/date is not treated as proof of reconciliation.
    const groupDates = group.map((t) => t.date.getTime());
    const minDate = new Date(Math.min(...groupDates) - 7 * 86400000);
    const maxDate = new Date(Math.max(...groupDates) + 7 * 86400000);
    const groupAmounts = new Set(group.map((t) => Math.abs(Number(t.amount)).toFixed(2)));
    const receiptPool = await prisma.receipt.findMany({
      where: { companyId: ctx.companyId, OR: [
        { date: { gte: minDate, lte: maxDate } },
        { aiDate: { gte: minDate, lte: maxDate } },
      ] },
      select: { id: true, date: true, aiDate: true, amount: true, aiAmount: true, description: true, merchantName: true, status: true },
      orderBy: { id: "desc" }, take: 500,
    });
    const receiptCandidates = receiptPool.filter((r) => {
      const amounts = [r.aiAmount, r.amount].filter((v): v is number => typeof v === "number").map((v) => Math.abs(v).toFixed(2));
      return amounts.some((v) => groupAmounts.has(v));
    }).slice(0, 20);

    // A bounded representative sample keeps one group analysis inexpensive.
    const sample = group.slice(0, 25).map((transaction) => {
      const raw = parseRawBankData(transaction.sourceRawData);
      return {
        date: transaction.date.toISOString().slice(0, 10),
        amount: Number(transaction.amount),
        text: transaction.text,
        paymentExplanation: String(raw.paymentExplanation ?? ""),
        textKey: String(raw.textKey ?? ""),
        counterparty: String(raw.counterparty ?? ""),
        counterpartyKennitala: String(raw.counterpartyKennitala ?? ""),
        reference: String(raw.reference ?? ""),
      };
    });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 180 * 1000, maxRetries: 0 });
    const response = await openai.responses.create({
      model: "gpt-5.6",
      input: [{ role: "user", content: [{ type: "input_text", text: `
Þú ert aðstoðarmaður bókara í GLÖGGT. Greindu BANKAMYNSTUR sem einn hóp, ekki hverja færslu sem sjálfstætt AI-verkefni.

Markmið: útskýra líklega bókhaldslega merkingu hópsins og hvort bókari geti tekið eina sameiginlega ákvörðun um hann.
Ekki bóka, ekki stofna reikningslykil, ekki fullyrða meira en gögnin styðja. Ef hópurinn virðist blandaður skaltu segja það skýrt og biðja um mannlega ákvörðun.

Bankareikningur: ${ctx.account.name} (${ctx.account.accountNumber ?? ""})
Mynstur: ${patternKey}
Undirmynstur: ${subpatternKey}
Fjöldi færslna í hópi: ${group.length}
Sýni: ${sample.length} færslur

Gögn:
${JSON.stringify(sample)}

Fyrirliggjandi fylgiskjöl sem fundust með samsvarandi upphæð og nálægri dagsetningu (aðeins möguleg tenging, ekki staðfest afstemming):
${JSON.stringify(receiptCandidates)}

Svaraðu AÐEINS sem gilt JSON með þessum reitum:
{
  "title": "stutt heiti",
  "summary": "stutt lýsing á því hvað hópurinn virðist vera",
  "suggestedCategory": "bókhaldsleg tegund eða 'óákveðið'",
  "rationale": "rök byggð eingöngu á gögnunum",
  "confidence": "HIGH|MEDIUM|LOW",
  "needsHumanDecision": true,
  "questions": ["spurning ef eitthvað þarf að staðfesta"]
}
` }] }],
    });

    const usage = response.usage;
    const inputTokens = usage?.input_tokens ?? 0;
    const cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const totalTokens = usage?.total_tokens ?? 0;
    const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
    // Same internal cost assumptions currently used by receipt analysis.
    const costUsd = (uncachedInputTokens / 1_000_000) * 5 + (cachedInputTokens / 1_000_000) * 0.5 + (outputTokens / 1_000_000) * 30;
    const usdIskRate = 122.94;
    const costIsk = costUsd * usdIskRate;

    let parsed: any;
    try { parsed = JSON.parse(cleanJson(response.output_text)); }
    catch { throw new Error("AI skilaði svari sem ekki var hægt að lesa sem JSON."); }

    await prisma.bankAiAnalysisCache.upsert({
      where: { bankAccountId_patternKey_subpatternKey_groupFingerprint: { bankAccountId, patternKey, subpatternKey, groupFingerprint: fingerprint } },
      create: {
        companyId: ctx.companyId, bankAccountId, patternKey, subpatternKey, groupFingerprint: fingerprint,
        resultJson: JSON.stringify(parsed), sampleCount: sample.length, totalGroupCount: group.length,
        matchedReceiptCount: receiptCandidates.length, inputTokens, cachedInputTokens, outputTokens, totalTokens,
        costUsd, costIsk, model: "gpt-5.6", createdByUserId: ctx.userId,
      },
      update: {
        resultJson: JSON.stringify(parsed), sampleCount: sample.length, totalGroupCount: group.length,
        matchedReceiptCount: receiptCandidates.length, inputTokens, cachedInputTokens, outputTokens, totalTokens,
        costUsd, costIsk, model: "gpt-5.6", createdByUserId: ctx.userId,
      },
    });

    await prisma.aiUsage.create({ data: {
      companyId, userId, action: "BANK_PATTERN_ANALYSIS", model: "gpt-5.6",
      inputTokens, cachedInputTokens, outputTokens, totalTokens, costUsd, costIsk, usdIskRate,
      durationMs: Date.now() - started, success: true,
    }});

    return {
      ok: true,
      title: String(parsed.title ?? "AI-greining"), summary: String(parsed.summary ?? ""),
      suggestedCategory: String(parsed.suggestedCategory ?? "óákveðið"), rationale: String(parsed.rationale ?? ""),
      confidence: ["HIGH", "MEDIUM", "LOW"].includes(parsed.confidence) ? parsed.confidence : "LOW",
      needsHumanDecision: parsed.needsHumanDecision !== false,
      questions: Array.isArray(parsed.questions) ? parsed.questions.map(String).slice(0, 5) : [],
      sampleCount: sample.length, totalGroupCount: group.length,
      inputTokens, cachedInputTokens, outputTokens, totalTokens, costIsk, costUsd,
      matchedReceiptCount: receiptCandidates.length, fromCache: false, analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Óþekkt villa í AI-greiningu.";
    if (companyId || userId) {
      await prisma.aiUsage.create({ data: {
        companyId, userId, action: "BANK_PATTERN_ANALYSIS", model: "gpt-5.6",
        durationMs: Date.now() - started, success: false, errorMessage: message.slice(0, 1000),
      }}).catch(() => undefined);
    }
    return { ok: false, error: message };
  }
}
