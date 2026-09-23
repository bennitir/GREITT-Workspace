import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRequestAuthContext, getRequestUserCompany, getRequestUserInterfaceSettings } from "@/lib/core/request-context";
import { formatDate } from "@/lib/locale";
import { formatNumber } from "@/app/banki/_lib/formatting/numbers";
import { bankAnalysisLanguage } from "@/app/banki/_lib/i18n/analysis-text";
import { annualAnalysisText } from "@/app/banki/_lib/i18n/annual-analysis-text";
import { annualStatementText } from "@/app/banki/_lib/i18n/annual-statement-text";
import { annualAnalysisExtraText } from "@/app/banki/_lib/i18n/annual-analysis-extra-text";
import { analyzeExpenseEvidence, analyzeIncomeEvidence, buildAccountBankAnalysis, buildAnnualBankAnalysis, buildGrantFlowSources, findPriorRelatedBankTransactions } from "@/app/banki/_lib/analysis/annual";
import { analyzeBankTransaction, parseRawBankData } from "@/app/banki/_lib/analysis/transactions";

type Props = {
  searchParams: Promise<{
    year?: string;
    flow?: string;
    group?: string;
    account?: string;
    incomeSort?: string;
    incomeConfidence?: string;
    incomeCategory?: string;
    expenseSort?: string;
    expenseConfidence?: string;
    expenseCategory?: string;
    q?: string;
    view?: string;
    tx?: string;
    relatedTx?: string;
    researchFocus?: string;
  }>;
};

type SortableGroup = {
  label: string;
  count: number;
  amount: number;
  confidence: string;
};

const confidenceSortRank: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function sortGroups<T extends SortableGroup>(groups: T[], sort: string) {
  return [...groups].sort((a, b) => {
    if (sort === "count-desc") return b.count - a.count || b.amount - a.amount;
    if (sort === "name-asc") return a.label.localeCompare(b.label, "is");
    if (sort === "confidence-low") {
      return (confidenceSortRank[a.confidence] ?? 9) - (confidenceSortRank[b.confidence] ?? 9) || b.amount - a.amount;
    }
    return b.amount - a.amount || b.count - a.count;
  });
}

function filterGroupsByConfidence<T extends SortableGroup>(groups: T[], confidence: string) {
  if (!["LOW", "MEDIUM", "HIGH"].includes(confidence)) return groups;
  return groups.filter((group) => group.confidence === confidence);
}

function filterGroupsBySearch<T extends SortableGroup>(groups: T[], q: string) {
  const needle = q.trim().toLocaleLowerCase("is");
  if (!needle) return groups;
  return groups.filter((group) => group.label.toLocaleLowerCase("is").includes(needle));
}


async function getContext() {
  const context = await getRequestAuthContext();
  const sessionUser = context.sessionUser;
  const companyId = context.activeCompanyId;

  if (!sessionUser) redirect("/innskraning?next=/banki/arsgreining");
  if (!companyId) redirect("/fyrirtaeki");

  if (sessionUser.role !== "ADMIN") {
    const access = await getRequestUserCompany(sessionUser.id, companyId);
    if (!access?.isActive) redirect("/fyrirtaeki");
  }

  const userSettings = await getRequestUserInterfaceSettings(sessionUser.id);

  return { companyId, language: bankAnalysisLanguage(userSettings?.interfaceLanguage) };
}

export default async function AnnualBankAnalysisPage({ searchParams }: Props) {
  const query = await searchParams;
  const { companyId, language } = await getContext();
  const t = annualAnalysisText(language);
  const x = annualAnalysisExtraText(language);
  const statementText = annualStatementText(language);

  const accounts = await prisma.bankAccount.findMany({
    where: { companyId, isActive: true },
    orderBy: { id: "asc" },
  });
  const accountIds = accounts.map((account) => account.id);
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  // Only the year selector needs cross-year information. Fetch distinct years
  // as a tiny aggregate instead of loading every BankTransaction into memory.
  const yearRows = accountIds.length
    ? await prisma.$queryRaw<Array<{ year: number }>>`
        SELECT DISTINCT EXTRACT(YEAR FROM bt."date")::int AS "year"
        FROM "BankTransaction" bt
        INNER JOIN "BankAccount" ba ON ba."id" = bt."bankAccountId"
        WHERE ba."companyId" = ${companyId}
          AND ba."isActive" = true
        ORDER BY "year" DESC
      `
    : [];
  const years = yearRows.map((row) => Number(row.year)).filter((value) => Number.isInteger(value));
  const requestedYear = Number(query.year);
  const year = Number.isInteger(requestedYear) && years.includes(requestedYear)
    ? requestedYear
    : years[0] ?? new Date().getFullYear();

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));
  const yearTransactionRows = accountIds.length
    ? await prisma.bankTransaction.findMany({
        where: {
          bankAccountId: { in: accountIds },
          date: { gte: yearStart, lt: nextYearStart },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      })
    : [];

  const yearTransactions = yearTransactionRows.map((item) => ({
    id: item.id,
    bankAccountId: item.bankAccountId,
    bankAccountName: accountById.get(item.bankAccountId)?.name ?? null,
    date: item.date,
    text: item.text,
    amount: Number(item.amount),
    sourceRawData: item.sourceRawData,
  }));

  const analysis = buildAnnualBankAnalysis(yearTransactions);
  const grantAccountIds = new Set(
    accounts
      .filter((account) => /styrk|grant|dotac|грант/i.test(account.name))
      .map((account) => account.id),
  );
  const grantFlows = buildGrantFlowSources(
    yearTransactions,
    analysis.classifiedIncomeGroups,
    analysis.flowThroughSuggestions,
    grantAccountIds,
  );
  const grantFlowIncomingTotal = grantFlows.reduce((sum, item) => sum + item.incomingAmount, 0);
  const grantFlowMatchedTotal = grantFlows.reduce((sum, item) => sum + item.strongMatchedAmount, 0);
  const grantFlowUnmatchedTotal = grantFlows.reduce((sum, item) => sum + item.unmatchedAmount, 0);

  const classificationLabel = (value: string) => ({
    OPERATING_REVENUE: t.operatingRevenue,
    GRANT_CONTRIBUTION: t.grantContribution,
    PAYMENT_SETTLEMENT: t.paymentSettlement,
    LOAN_CAPITAL: t.loanCapital,
    REFUND: t.refunds,
    OTHER: t.other,
    UNKNOWN: t.unknown,
  }[value] ?? value);
  const confidenceLabel = (value: string) => ({ HIGH: t.high, MEDIUM: t.medium, LOW: t.low }[value] ?? value);
  const expenseClassificationLabel = (value: string) => ({
    OPERATING_EXPENSE: t.operatingExpense,
    PREMISES: t.premises,
    UTILITIES: t.utilities,
    TELECOM: t.telecom,
    SOFTWARE: t.software,
    INSURANCE: t.insurance,
    VEHICLE: t.vehicle,
    TRAVEL: t.travel,
    ADVERTISING: t.advertising,
    TRANSPORT: t.transport,
    GOODS_SERVICES: t.goodsServices,
    DINING: t.dining,
    GROCERY_PURCHASE: t.groceryPurchase,
    OFFICE_SUPPLIES: t.officeSupplies,
    RESALE_GOODS: t.resaleGoods,
    EVENT_HOSPITALITY: t.eventHospitality,
    SPORTS_EVENT: t.sportsEvent,
    SPORTS_EQUIPMENT: t.sportsEquipment,
    TELECOM_EQUIPMENT: t.telecomEquipment,
    POS_PAYMENT_SERVICE: t.posPaymentService,
    ADMIN_REGISTRATION_FEE: t.adminRegistrationFee,
    RELATED_ENTITY_FLOW: t.relatedEntityFlow,
    GRANT: t.grants,
    COST_ALLOWANCE: t.costAllowances,
    WAGES: t.wages,
    PAYROLL_RELATED: t.payrollRelated,
    PERSON_PAYMENT: t.personPayments,
    BANK_FEE: t.bankFee,
    CASH_WITHDRAWAL: t.cashWithdrawal,
    ASSET_INVESTMENT: t.assetInvestment,
    LOAN_CAPITAL: t.loanCapital,
    REFUND: t.refunds,
    TAX_FINANCIAL: t.taxFinancial,
    OTHER: t.other,
    MIXED: t.mixedExpense,
    UNKNOWN: t.expenseUnknown,
  }[value] ?? value);

  const incomeSort = ["amount-desc", "count-desc", "name-asc", "confidence-low"].includes(query.incomeSort ?? "")
    ? query.incomeSort!
    : "amount-desc";
  const expenseSort = ["amount-desc", "count-desc", "name-asc", "confidence-low"].includes(query.expenseSort ?? "")
    ? query.expenseSort!
    : "amount-desc";
  const incomeConfidence = ["LOW", "MEDIUM", "HIGH"].includes(query.incomeConfidence ?? "")
    ? query.incomeConfidence!
    : "ALL";
  const expenseConfidence = ["LOW", "MEDIUM", "HIGH"].includes(query.expenseConfidence ?? "")
    ? query.expenseConfidence!
    : "ALL";
  const expenseCategory = ["WAGES", "PAYROLL_RELATED", "PERSON_PAYMENT", "PREMISES", "UTILITIES", "TELECOM", "SOFTWARE", "INSURANCE", "VEHICLE", "TRAVEL", "ADVERTISING", "TRANSPORT", "GOODS_SERVICES", "DINING", "GROCERY_PURCHASE", "OFFICE_SUPPLIES", "RESALE_GOODS", "EVENT_HOSPITALITY", "SPORTS_EVENT", "SPORTS_EQUIPMENT", "TELECOM_EQUIPMENT", "POS_PAYMENT_SERVICE", "ADMIN_REGISTRATION_FEE", "RELATED_ENTITY_FLOW", "GRANT", "CONTRIBUTION", "COST_ALLOWANCE", "BANK_FEE", "CASH_WITHDRAWAL", "ASSET_INVESTMENT", "LOAN_CAPITAL", "REFUND", "TAX_FINANCIAL", "OPERATING_EXPENSE", "OTHER", "MIXED", "UNKNOWN"].includes(query.expenseCategory ?? "")
    ? query.expenseCategory!
    : "ALL";
  const incomeCategory = ["OPERATING_REVENUE", "GRANT_CONTRIBUTION", "PAYMENT_SETTLEMENT", "LOAN_CAPITAL", "REFUND", "OTHER", "UNKNOWN"].includes(query.incomeCategory ?? "")
    ? query.incomeCategory!
    : "ALL";
  const researchFocus = (query.researchFocus ?? "").trim();
  const researchIncomeFocuses: Record<string, string> = {
    grantRelatedInflows: "GRANT_CONTRIBUTION",
    unknownInflows: "UNKNOWN",
    refundInflows: "REFUND",
    loanInflows: "LOAN_CAPITAL",
    otherInflows: "OTHER",
  };
  const researchExpenseFocuses: Record<string, string> = {
    unknownOutflows: "UNKNOWN",
    personPayments: "PERSON_PAYMENT",
    relatedEntityFlows: "RELATED_ENTITY_FLOW",
    assetInvestments: "ASSET_INVESTMENT",
    loanOutflows: "LOAN_CAPITAL",
    refundOutflows: "REFUND",
    cashWithdrawals: "CASH_WITHDRAWAL",
    otherOutflows: "OTHER",
  };
  const searchQuery = (query.q ?? "").trim();
  const requestedView = query.view ?? "overview";
  const view = ["overview", "summary", "income", "expenses", "flows", "patterns", "accounts"].includes(requestedView)
    ? requestedView
    : "overview";

  const incomeCategoryGroups = incomeCategory === "ALL"
    ? analysis.classifiedIncomeGroups
    : analysis.classifiedIncomeGroups.filter((group) => group.classification === incomeCategory);
  const visibleIncomeGroups = sortGroups(
    filterGroupsBySearch(filterGroupsByConfidence(incomeCategoryGroups, incomeConfidence), searchQuery),
    incomeSort,
  );
  const expenseCategoryGroups = expenseCategory === "ALL"
    ? analysis.classifiedExpenseGroups
    : analysis.classifiedExpenseGroups.filter((group) =>
        group.classification === expenseCategory ||
        group.breakdown.some((item) => item.classification === expenseCategory)
      );
  const visibleExpenseGroups = sortGroups(
    filterGroupsBySearch(filterGroupsByConfidence(expenseCategoryGroups, expenseConfidence), searchQuery),
    expenseSort,
  );

  const researchTransactionIds = new Set<number>();
  const researchIncomeCategory = researchIncomeFocuses[researchFocus] ?? null;
  const researchExpenseCategory = researchExpenseFocuses[researchFocus] ?? null;
  if (researchIncomeCategory) {
    // Keep this selection identical to classificationTotals in annual.ts:
    // classify each transaction on its own, and exclude internal incoming
    // transfers and interest income before assigning the research bucket.
    // Using the summary group's classification here is unsafe because a mixed
    // counterparty group is deliberately labelled UNKNOWN even when individual
    // rows inside it have stronger evidence.
    const internalIncomingIds = new Set(analysis.internalPairs.map((pair) => pair.incomingId));
    for (const item of yearTransactions) {
      if (item.amount <= 0 || internalIncomingIds.has(item.id)) continue;
      const base = analyzeBankTransaction({
        text: item.text,
        amount: item.amount,
        sourceRawData: item.sourceRawData,
      });
      if (base.kind === "INTEREST_INCOME") continue;
      if (analyzeIncomeEvidence(item).classification === researchIncomeCategory) {
        researchTransactionIds.add(item.id);
      }
    }
  }
  if (researchExpenseCategory) {
    for (const group of analysis.classifiedExpenseGroups) {
      for (const part of group.breakdown) {
        if (part.classification === researchExpenseCategory) {
          for (const id of part.transactionIds) researchTransactionIds.add(id);
        }
      }
    }
  }
  const researchTransactions = yearTransactions
    .filter((item) => researchTransactionIds.has(item.id))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.date.getTime() - b.date.getTime());
  const researchTransactionsTotal = researchTransactions.reduce((sum, item) => sum + Math.abs(item.amount), 0);

  // Research rows from Innsýn must be able to continue all the way down to
  // the existing transaction drilldown. Resolve the owning analysis group from
  // the transaction id instead of inventing a second detail view.
  const researchTransactionHref = (transactionId: number) => {
    const flow = researchExpenseCategory ? "out" : "in";
    const groups = flow === "out" ? analysis.classifiedExpenseGroups : analysis.classifiedIncomeGroups;
    const group = groups.find((candidate) => candidate.transactionIds.includes(transactionId));
    if (!group) return "#innsyn-rannsokn";
    const categoryParam = flow === "out" && researchExpenseCategory
      ? `&expenseCategory=${encodeURIComponent(researchExpenseCategory)}`
      : flow === "in" && researchIncomeCategory
        ? `&incomeCategory=${encodeURIComponent(researchIncomeCategory)}`
        : "";
    return `/banki/arsgreining?year=${year}&view=${flow === "in" ? "income" : "expenses"}&flow=${flow}&group=${encodeURIComponent(group.key)}${categoryParam}&tx=${transactionId}#faerslur`;
  };

  const selectedFlow = query.flow === "out" ? "out" : query.flow === "in" ? "in" : null;
  const selectedGroupKey = query.group ?? null;
  const selectedIncomeGroup = selectedFlow === "in"
    ? analysis.classifiedIncomeGroups.find((group) => group.key === selectedGroupKey) ?? null
    : null;
  const selectedExpenseGroup = selectedFlow === "out"
    ? analysis.classifiedExpenseGroups.find((group) => group.key === selectedGroupKey) ?? null
    : null;
  const selectedGroup = selectedIncomeGroup ?? selectedExpenseGroup;
  const selectedCategoryBreakdown = selectedExpenseGroup && expenseCategory !== "ALL"
    ? selectedExpenseGroup.breakdown.find((item) => item.classification === expenseCategory) ?? null
    : null;
  const selectedTransactionIds = new Set(
    selectedCategoryBreakdown?.transactionIds ?? selectedGroup?.transactionIds ?? [],
  );
  const requestedDrilldownAccountId = Number(query.account);
  const requestedRelatedTransactionIds = new Set(
    String(query.relatedTx ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value)),
  );
  const selectedTransactions = yearTransactions.filter((item) =>
    selectedTransactionIds.has(item.id) &&
    (!Number.isInteger(requestedDrilldownAccountId) || item.bankAccountId === requestedDrilldownAccountId) &&
    (!requestedRelatedTransactionIds.size || requestedRelatedTransactionIds.has(item.id))
  );
  const requestedResearchTransactionId = Number(query.tx);
  const selectedResearchTransaction = Number.isInteger(requestedResearchTransactionId)
    ? selectedTransactions.find((item) => item.id === requestedResearchTransactionId) ?? null
    : null;
  const selectedResearchTransactions = selectedResearchTransaction ? [selectedResearchTransaction] : [];

  const baseSelectedRecurringPattern = selectedFlow === "out" && selectedGroup
    ? analysis.recurringExpensePatterns.find((pattern) => pattern.groupKey === selectedGroup.key) ?? null
    : null;

  // A category drilldown must not show a recurring pattern calculated from the
  // counterparty's other transactions. Recalculate the visible pattern from the
  // transactions that are actually in the current research selection.
  const selectedRecurringItems = baseSelectedRecurringPattern
    ? selectedTransactions.filter((item) => baseSelectedRecurringPattern.transactionIds.includes(item.id))
    : [];
  const selectedRecurringMonths = new Set(
    selectedRecurringItems.map((item) => `${item.date.getFullYear()}-${item.date.getMonth() + 1}`),
  );
  const selectedRecurringAmounts = selectedRecurringItems.map((item) => Math.abs(item.amount));
  const selectedRecurringPattern = baseSelectedRecurringPattern && selectedRecurringItems.length >= 2 && selectedRecurringMonths.size >= 2
    ? {
        ...baseSelectedRecurringPattern,
        transactionIds: selectedRecurringItems.map((item) => item.id),
        count: selectedRecurringItems.length,
        monthCount: selectedRecurringMonths.size,
        amount: selectedRecurringAmounts.reduce((sum, amount) => sum + amount, 0),
        averageAmount: selectedRecurringAmounts.reduce((sum, amount) => sum + amount, 0) / selectedRecurringItems.length,
        minAmount: Math.min(...selectedRecurringAmounts),
        maxAmount: Math.max(...selectedRecurringAmounts),
      }
    : null;
  const recurringTransactionIds = new Set(selectedRecurringPattern?.transactionIds ?? []);
  const relatedBankTargets = selectedResearchTransactions.filter(
    (item) => item.amount > 0 && analyzeIncomeEvidence(item).evidence === "loan-refund-link-needed",
  );
  const earliestRelatedTarget = relatedBankTargets.length
    ? new Date(Math.min(...relatedBankTargets.map((item) => item.date.getTime())))
    : null;
  const latestRelatedTarget = relatedBankTargets.length
    ? new Date(Math.max(...relatedBankTargets.map((item) => item.date.getTime())))
    : null;
  const priorRelatedRows = earliestRelatedTarget && latestRelatedTarget && accountIds.length
    ? await prisma.bankTransaction.findMany({
        where: {
          bankAccountId: { in: accountIds },
          date: {
            gte: new Date(earliestRelatedTarget.getTime() - 121 * 86_400_000),
            lt: latestRelatedTarget,
          },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      })
    : [];
  const priorRelatedTransactions = priorRelatedRows.map((item) => ({
    id: item.id,
    bankAccountId: item.bankAccountId,
    bankAccountName: accountById.get(item.bankAccountId)?.name ?? null,
    date: item.date,
    text: item.text,
    amount: Number(item.amount),
    sourceRawData: item.sourceRawData,
  }));
  const relatedSearchTransactions = [...priorRelatedTransactions, ...relatedBankTargets];
  const relatedBankLinks = relatedBankTargets.flatMap((target) =>
    findPriorRelatedBankTransactions(relatedSearchTransactions, target).map((link) => ({ target, link })),
  );
  const transactionById = new Map(
    [...yearTransactions, ...priorRelatedTransactions].map((item) => [item.id, item]),
  );

  // First Bank -> Receipt bridge. Keep this deliberately conservative: exact
  // amount, a bounded date window, and optional counterparty identity evidence.
  // These are research candidates only; they never confirm or post anything.
  const receiptLinkTargets = selectedResearchTransactions.filter((item) =>
    item.amount > 0 && analyzeIncomeEvidence(item).evidence === "loan-refund-link-needed"
  );
  const receiptCandidates = receiptLinkTargets.length
    ? await prisma.receipt.findMany({
        where: { companyId },
        select: {
          id: true, date: true, aiDate: true, amount: true, aiAmount: true,
          description: true, merchantName: true, merchantKennitala: true, status: true,
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      })
    : [];
  const relatedReceiptLinks = receiptLinkTargets.flatMap((target) => {
    const raw = parseRawBankData(target.sourceRawData);
    const targetKt = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
    const targetName = String(raw.counterparty ?? target.text ?? "").trim().toLocaleLowerCase("is-IS");
    return receiptCandidates.flatMap((receipt) => {
      const receiptAmount = Number(receipt.aiAmount ?? receipt.amount);
      if (!Number.isFinite(receiptAmount) || Math.abs(receiptAmount - Math.abs(target.amount)) > 0.01) return [];
      const receiptDate = receipt.aiDate ?? receipt.date;
      if (!receiptDate) return [];
      const dayDistance = Math.round(Math.abs(target.date.getTime() - receiptDate.getTime()) / 86_400_000);
      if (dayDistance > 45) return [];
      const receiptKt = String(receipt.merchantKennitala ?? "").replace(/\D/g, "");
      const receiptName = String(receipt.merchantName ?? receipt.description ?? "").trim().toLocaleLowerCase("is-IS");
      const sameKennitala = Boolean(targetKt && receiptKt && targetKt === receiptKt);
      const sameName = Boolean(targetName && receiptName && (targetName.includes(receiptName) || receiptName.includes(targetName)));
      return [{
        target, receipt, receiptDate, dayDistance,
        confidence: sameKennitala ? "HIGH" as const : sameName ? "HIGH" as const : "MEDIUM" as const,
        reasons: ["EXACT_AMOUNT" as const, ...(sameKennitala ? ["SAME_KENNITALA" as const] : []), ...(sameName ? ["SAME_NAME" as const] : [])],
      }];
    }).sort((a, b) => (a.confidence === b.confidence ? a.dayDistance - b.dayDistance : a.confidence === "HIGH" ? -1 : 1)).slice(0, 5);
  });

  // First Bank -> FinancialEvent / Innsyn bridge. Keep the first pass as
  // conservative as the receipt bridge: exact amount and a bounded date
  // window. Event title/reference can strengthen the explanation later, but
  // do not infer accounting recognition from an amount/date match alone.
  const financialEventCandidates = receiptLinkTargets.length
    ? await prisma.financialEvent.findMany({
        where: { companyId },
        select: {
          id: true, eventType: true, status: true, title: true, eventDate: true,
          periodStart: true, periodEnd: true, amount: true, externalReference: true,
        },
        orderBy: [{ eventDate: "asc" }, { id: "asc" }],
      })
    : [];
  const relatedFinancialEventLinks = receiptLinkTargets.flatMap((target) =>
    financialEventCandidates.flatMap((event) => {
      const eventAmount = event.amount === null ? null : Number(event.amount);
      if (eventAmount === null || !Number.isFinite(eventAmount) || Math.abs(Math.abs(eventAmount) - Math.abs(target.amount)) > 0.01) return [];
      const eventDate = event.eventDate ?? event.periodEnd ?? event.periodStart;
      if (!eventDate) return [];
      const dayDistance = Math.round(Math.abs(target.date.getTime() - eventDate.getTime()) / 86_400_000);
      if (dayDistance > 45) return [];
      return [{ target, event, eventDate, dayDistance, confidence: "MEDIUM" as const }];
    }).sort((a, b) => a.dayDistance - b.dayDistance).slice(0, 5)
  );

  // Deterministic source-account trace for the selected group. This answers
  // which of the company's own bank accounts the payments actually moved
  // through without inferring the economic purpose or recipient bank account.
  const selectedAccountTrace = Array.from(
    selectedTransactions.reduce((groups, item) => {
      const current = groups.get(item.bankAccountId) ?? { bankAccountId: item.bankAccountId, count: 0, amount: 0 };
      current.count += 1;
      current.amount += Math.abs(item.amount);
      groups.set(item.bankAccountId, current);
      return groups;
    }, new Map<number, { bankAccountId: number; count: number; amount: number }>()).values(),
  ).sort((a, b) => b.amount - a.amount || b.count - a.count);

  // Surface recurring raw bank-field values without assigning them a business
  // meaning. This is useful for unexplained groups: the researcher can see
  // whether references, payment explanations or text keys repeat before any
  // classification rule is introduced.
  // Cross-bank intermediary research. Bank counterparty and underlying party are
  // deliberately separate concepts. An embedded kennitala that differs from
  // the visible bank counterparty is surfaced as evidence only; it never
  // reclassifies or posts the transaction.
  const selectedIntermediaryLinks = (() => {
    if (selectedFlow !== "in") return [];
    const directPartyByKennitala = new Map<string, { name: string; transactionId: number }>();
    for (const transaction of yearTransactions) {
      const raw = parseRawBankData(transaction.sourceRawData);
      const kennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
      const name = String(raw.counterparty ?? transaction.text ?? "").trim();
      if (kennitala.length === 10 && name && !directPartyByKennitala.has(kennitala)) {
        directPartyByKennitala.set(kennitala, { name, transactionId: transaction.id });
      }
    }
    const normalizePartyName = (value: string) => value
      .toLocaleLowerCase("is")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9áðéíóúýþæö]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const isLikelySamePartyName = (researchText: string, partyName: string) => {
      if (!researchText || !partyName) return false;
      if (researchText.includes(partyName)) return true;

      // Bank descriptions are sometimes truncated (for example "Ungmennafélagið Þrót"
      // instead of "Ungmennafélagið Þróttur"). Accept a long prefix only when the
      // shared text is substantial and covers most of the known party name. This keeps
      // the rule generic while avoiding loose word-level guesses.
      const maxComparableLength = Math.min(researchText.length, partyName.length);
      let sharedPrefixLength = 0;
      while (
        sharedPrefixLength < maxComparableLength &&
        researchText[sharedPrefixLength] === partyName[sharedPrefixLength]
      ) {
        sharedPrefixLength += 1;
      }
      return sharedPrefixLength >= 12 && sharedPrefixLength / partyName.length >= 0.75;
    };

    const directParties = Array.from(directPartyByKennitala.entries())
      .map(([kennitala, party]) => ({ kennitala, ...party, normalizedName: normalizePartyName(party.name) }))
      .filter((party) => party.normalizedName.length >= 6);

    const grouped = new Map<string, { kennitala: string; name: string | null; count: number; amount: number; transactionIds: number[]; groupKey: string | null }>();
    for (const transaction of selectedTransactions) {
      if (transaction.amount <= 0) continue;
      const raw = parseRawBankData(transaction.sourceRawData);
      const visibleKennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
      const rawResearchFields = [raw.paymentExplanation, raw.textKey, raw.reference]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      const embeddedKennitolas = rawResearchFields
        .flatMap((value) => value.match(/\b\d{10}\b/g) ?? [])
        .filter((kennitala, index, values) => kennitala !== visibleKennitala && values.indexOf(kennitala) === index);
      const normalizedResearchText = normalizePartyName(rawResearchFields.join(" "));
      const namedKennitolas = directParties
        .filter((party) =>
          party.kennitala !== visibleKennitala &&
          isLikelySamePartyName(normalizedResearchText, party.normalizedName)
        )
        .map((party) => party.kennitala);
      const embedded = Array.from(new Set([...embeddedKennitolas, ...namedKennitolas]));

      for (const kennitala of embedded) {
        const directParty = directPartyByKennitala.get(kennitala) ?? null;
        // The first occurrence of a party in the year's bank data may be an outflow,
        // while this research view navigates income groups. Resolve the destination
        // from any positive transaction for the same kennitala instead of relying on
        // that first occurrence. This keeps the intermediary link deterministic and
        // makes the underlying party navigable whenever it has an income research group.
        const directIncomeTransactionIds = yearTransactions
          .filter((candidate) => {
            if (candidate.amount <= 0) return false;
            const candidateRaw = parseRawBankData(candidate.sourceRawData);
            return String(candidateRaw.counterpartyKennitala ?? "").replace(/\D/g, "") === kennitala;
          })
          .map((candidate) => candidate.id);
        const directGroup = analysis.classifiedIncomeGroups.find((group) =>
          group.transactionIds.some((transactionId) => directIncomeTransactionIds.includes(transactionId))
        ) ?? null;
        const current = grouped.get(kennitala) ?? {
          kennitala, name: directParty?.name ?? null, count: 0, amount: 0, transactionIds: [], groupKey: directGroup?.key ?? null,
        };
        current.count += 1;
        current.amount += transaction.amount;
        current.transactionIds.push(transaction.id);
        if (!current.name && directParty?.name) current.name = directParty.name;
        if (!current.groupKey && directGroup?.key) current.groupKey = directGroup.key;
        grouped.set(kennitala, current);
      }
    }

    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
  })();

  // Reverse intermediary research. When the selected party itself is named inside
  // another counterparty's bank details, surface that incoming path here as well.
  // This turns one-way clues into a navigable research network without treating
  // the relationship as accounting confirmation.
  const reverseIntermediaryLinks = (() => {
    if (selectedFlow !== "in" || !selectedTransactions.length) return [];

    const normalizePartyName = (value: string) => value
      .toLocaleLowerCase("is")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9áðéíóúýþæö]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const isLikelySamePartyName = (researchText: string, partyName: string) => {
      if (!researchText || !partyName) return false;
      if (researchText.includes(partyName)) return true;
      const maxComparableLength = Math.min(researchText.length, partyName.length);
      let sharedPrefixLength = 0;
      while (sharedPrefixLength < maxComparableLength && researchText[sharedPrefixLength] === partyName[sharedPrefixLength]) sharedPrefixLength += 1;
      return sharedPrefixLength >= 12 && sharedPrefixLength / partyName.length >= 0.75;
    };

    const selectedParties = new Map<string, string>();
    for (const transaction of selectedTransactions) {
      const raw = parseRawBankData(transaction.sourceRawData);
      const kennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
      const name = String(raw.counterparty ?? transaction.text ?? "").trim();
      if (kennitala.length === 10 && name) selectedParties.set(kennitala, name);
    }
    if (!selectedParties.size) return [];

    const selectedIds = new Set(selectedTransactions.map((item) => item.id));
    const grouped = new Map<string, { sourceName: string; sourceKennitala: string; count: number; amount: number; transactionIds: number[]; groupKey: string | null }>();
    for (const transaction of yearTransactions) {
      if (transaction.amount <= 0 || selectedIds.has(transaction.id)) continue;
      const raw = parseRawBankData(transaction.sourceRawData);
      const visibleKennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
      const visibleName = String(raw.counterparty ?? transaction.text ?? "").trim();
      const rawResearchFields = [raw.paymentExplanation, raw.textKey, raw.reference]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      const normalizedResearchText = normalizePartyName(rawResearchFields.join(" "));
      const embeddedKennitolas = rawResearchFields.flatMap((value) => value.match(/\b\d{10}\b/g) ?? []);

      const matchesSelected = Array.from(selectedParties.entries()).some(([kennitala, name]) =>
        kennitala !== visibleKennitala && (
          embeddedKennitolas.includes(kennitala) ||
          isLikelySamePartyName(normalizedResearchText, normalizePartyName(name))
        )
      );
      if (!matchesSelected || !visibleName) continue;

      const sourceGroup = analysis.classifiedIncomeGroups.find((group) => group.transactionIds.includes(transaction.id)) ?? null;
      const key = sourceGroup?.key ?? `${visibleKennitala}:${normalizePartyName(visibleName)}`;
      const current = grouped.get(key) ?? { sourceName: visibleName, sourceKennitala: visibleKennitala, count: 0, amount: 0, transactionIds: [], groupKey: sourceGroup?.key ?? null };
      current.count += 1;
      current.amount += transaction.amount;
      current.transactionIds.push(transaction.id);
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
  })();

  const selectedRecurringBankFields = (() => {
    const fields = [
      { key: "reference", label: t.bankFieldReference },
      { key: "paymentExplanation", label: t.bankFieldPaymentExplanation },
      { key: "textKey", label: t.bankFieldTextKey },
    ] as const;
    return fields.flatMap((field) => {
      const values = new Map<string, { count: number; amount: number }>();
      for (const item of selectedTransactions) {
        const raw = parseRawBankData(item.sourceRawData);
        const value = String(raw[field.key] ?? "").trim();
        if (!value) continue;
        const current = values.get(value) ?? { count: 0, amount: 0 };
        current.count += 1;
        current.amount += item.amount;
        values.set(value, current);
      }
      return Array.from(values.entries())
        .filter(([, summary]) => summary.count >= 2)
        .map(([value, summary]) => ({ field: field.label, value, ...summary }));
    }).sort((a, b) => b.count - a.count || Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 12);
  })();

  // Research repeated reference variants without assigning semantic meaning to
  // the letters themselves. For example, D/K stay neutral until independently
  // confirmed; we only expose their observed counts, amounts and date spans.
  const selectedReferenceVariantSummary = selectedIncomeGroup?.referencePattern?.signal === "REPEATED_SETTLEMENT_PATTERN"
    ? selectedIncomeGroup.referencePattern.variants.map((variant) => {
        const pattern = selectedIncomeGroup.referencePattern!;
        const matching = selectedTransactions.filter((item) => {
          const raw = parseRawBankData(item.sourceRawData);
          return [raw.reference, raw.paymentExplanation, raw.textKey]
            .map((value) => String(value ?? "").trim())
            .filter(Boolean)
            .some((candidate) =>
              candidate === `${pattern.stem}-${variant}` ||
              candidate === `${pattern.stem}_${variant}` ||
              candidate === `${pattern.stem} ${variant}` ||
              candidate === `${pattern.stem}${variant}`
            );
        }).sort((a, b) => a.date.getTime() - b.date.getTime());
        return {
          variant,
          count: matching.length,
          amount: matching.reduce((sum, item) => sum + item.amount, 0),
          firstDate: matching[0]?.date ?? null,
          lastDate: matching[matching.length - 1]?.date ?? null,
        };
      })
    : [];

  // Compare the timing of adjacent reference variants without treating them as
  // confirmed settlement pairs. This exposes whether different variants tend to
  // occur together or on nearby dates while keeping their semantic meaning open.
  const selectedReferenceVariantTiming = selectedIncomeGroup?.referencePattern?.signal === "REPEATED_SETTLEMENT_PATTERN"
    ? (() => {
        const pattern = selectedIncomeGroup.referencePattern!;
        const rows = selectedTransactions.flatMap((item) => {
          const raw = parseRawBankData(item.sourceRawData);
          const candidate = [raw.reference, raw.paymentExplanation, raw.textKey]
            .map((value) => String(value ?? "").trim())
            .find((value) => pattern.variants.some((variant) =>
              value === `${pattern.stem}-${variant}` ||
              value === `${pattern.stem}_${variant}` ||
              value === `${pattern.stem} ${variant}` ||
              value === `${pattern.stem}${variant}`
            ));
          if (!candidate) return [];
          const variant = pattern.variants.find((value) =>
            candidate === `${pattern.stem}-${value}` ||
            candidate === `${pattern.stem}_${value}` ||
            candidate === `${pattern.stem} ${value}` ||
            candidate === `${pattern.stem}${value}`
          );
          return variant ? [{ date: item.date, variant }] : [];
        }).sort((a, b) => a.date.getTime() - b.date.getTime());

        const transitions: Array<{ from: string; to: string; dayGap: number }> = [];
        for (let index = 1; index < rows.length; index += 1) {
          const previous = rows[index - 1];
          const current = rows[index];
          if (previous.variant === current.variant) continue;
          transitions.push({
            from: previous.variant,
            to: current.variant,
            dayGap: Math.round(Math.abs(current.date.getTime() - previous.date.getTime()) / 86_400_000),
          });
        }

        const gaps = transitions.map((item) => item.dayGap).sort((a, b) => a - b);
        const medianGap = gaps.length
          ? gaps.length % 2 === 1
            ? gaps[Math.floor(gaps.length / 2)]
            : (gaps[gaps.length / 2 - 1] + gaps[gaps.length / 2]) / 2
          : null;

        return {
          transitionCount: transitions.length,
          sameDay: transitions.filter((item) => item.dayGap === 0).length,
          nextDay: transitions.filter((item) => item.dayGap === 1).length,
          twoToSevenDays: transitions.filter((item) => item.dayGap >= 2 && item.dayGap <= 7).length,
          overSevenDays: transitions.filter((item) => item.dayGap > 7).length,
          medianGap,
        };
      })()
    : null;

  const drilldownHref = (flow: "in" | "out", key: string) => {
    const categoryParam = flow === "out" && expenseCategory !== "ALL"
      ? `&expenseCategory=${encodeURIComponent(expenseCategory)}`
      : "";
    return `/banki/arsgreining?year=${year}&view=${flow === "in" ? "income" : "expenses"}&flow=${flow}&group=${encodeURIComponent(key)}${categoryParam}#faerslur`;
  };

  const transactionResearchHref = (transactionId: number) => {
    if (!selectedFlow || !selectedGroup) return "#faerslur";
    const categoryParam = selectedFlow === "out" && expenseCategory !== "ALL"
      ? `&expenseCategory=${encodeURIComponent(expenseCategory)}`
      : "";
    const accountParam = Number.isInteger(requestedDrilldownAccountId)
      ? `&account=${requestedDrilldownAccountId}`
      : "";
    const relatedTxParam = requestedRelatedTransactionIds.size
      ? `&relatedTx=${encodeURIComponent(Array.from(requestedRelatedTransactionIds).join(","))}`
      : "";
    return `/banki/arsgreining?year=${year}&view=${selectedFlow === "in" ? "income" : "expenses"}&flow=${selectedFlow}&group=${encodeURIComponent(selectedGroup.key)}${categoryParam}${accountParam}${relatedTxParam}&tx=${transactionId}#faerslur`;
  };

  const byAccount = accounts.map((account) => {
    const tx = yearTransactions.filter((item) => item.bankAccountId === account.id);
    return {
      account,
      count: tx.length,
      inflows: tx.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0),
      outflows: Math.abs(tx.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0)),
    };
  }).filter((row) => row.count > 0);

  const requestedAccountId = Number(query.account);
  const selectedAccount = Number.isInteger(requestedAccountId)
    ? accounts.find((account) => account.id === requestedAccountId) ?? null
    : null;
  const selectedAccountAnalysis = selectedAccount
    ? buildAccountBankAnalysis(yearTransactions, selectedAccount.id)
    : null;
  const accountAnalysisHref = (accountId: number) =>
    `/banki/arsgreining?year=${year}&view=accounts&account=${accountId}#reikningsgreining`;
  const accountFlowDrilldownHref = (flow: "in" | "out", key: string) =>
    `/banki/arsgreining?year=${year}&view=accounts&account=${selectedAccount?.id ?? ""}&flow=${flow}&group=${encodeURIComponent(key)}#faerslur`;

  return (
    <main className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📊 {t.title}</h1>
          <p className="mt-2 max-w-4xl text-gray-600">{t.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/banki/arsreikningur?year=${year}`} className="rounded-lg border border-slate-400 px-4 py-2 font-medium hover:bg-slate-50">{statementText.link} →</Link>
          <Link href="/banki" className="rounded-lg border px-4 py-2 font-medium">← {t.back}</Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="font-medium">{t.year}:</span>
        {years.length ? years.map((candidateYear) => (
          <Link
            key={candidateYear}
            href={`/banki/arsgreining?year=${candidateYear}&view=${view}`}
            className={`rounded-lg border px-3 py-1.5 ${candidateYear === year ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            {candidateYear}
          </Link>
        )) : <span>{year}</span>}
      </div>

      <nav className="sticky top-0 z-20 mt-5 flex flex-wrap gap-2 border-y bg-white/95 py-3 backdrop-blur" aria-label={x.navAria}>
        {[
          ["overview", x.overview],
          ["summary", x.summary],
          ["income", x.income],
          ["expenses", x.expenses],
          ["flows", x.flows],
          ["patterns", x.patterns],
          ["accounts", x.accounts],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/banki/arsgreining?year=${year}&view=${key}`}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${view === key ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {yearTransactions.length === 0 ? (
        <div className="mt-6 rounded-lg border bg-gray-50 p-6">{t.noData}</div>
      ) : (
        <>
          <section className={`${view === "summary" ? "" : "hidden"} mt-6 space-y-6`}>
            <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">{x.analysis} {year}</p>
                  <h2 className="mt-1 text-2xl font-bold">{x.bridgeTitle}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-slate-600">
                    {x.bridgeHelp}
                  </p>
                </div>
                <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-slate-600">{x.dataFirst}</span>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label={x.totalInflows} value={`${formatNumber(Math.round(analysis.grossInflows))} kr.`} />
                <Stat label={x.totalOutflows} value={`${formatNumber(Math.round(analysis.grossOutflows))} kr.`} />
                <Stat label={x.likelyTurnover} value={`${formatNumber(Math.round(analysis.likelyTurnover))} kr.`} />
                <Stat label={x.unclassifiedOutflow} value={`${formatNumber(Math.round(analysis.outflowStillToClassify))} kr.`} href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=UNKNOWN&expenseSort=amount-desc#utgjaldalisti`} hint={x.viewUnclassified} />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-xl border p-6">
                <h3 className="text-lg font-semibold">{x.incomeSide}</h3>
                <p className="mt-1 text-sm text-gray-500">{x.incomeSideHelp}</p>
                <div className="mt-4 space-y-3">
                  <BridgeRow label={x.strongOperatingRevenue} value={analysis.classificationTotals.OPERATING_REVENUE} />
                  <BridgeRow label={x.paymentSettlement} value={analysis.classificationTotals.PAYMENT_SETTLEMENT} />
                  <BridgeRow label={x.grants} value={analysis.classificationTotals.GRANT_CONTRIBUTION} />
                  <BridgeRow label={x.loans} value={analysis.classificationTotals.LOAN_CAPITAL} />
                  <BridgeRow label={x.refunds} value={analysis.classificationTotals.REFUND} />
                  <div className="border-t pt-3"><BridgeRow label={x.unknownInflows} value={analysis.classificationTotals.UNKNOWN} strong /></div>
                </div>
              </div>

              <div className="rounded-xl border p-6">
                <h3 className="text-lg font-semibold">{x.expenseSide}</h3>
                <p className="mt-1 text-sm text-gray-500">{x.expenseSideHelp}</p>
                <div className="mt-4 space-y-3">
                  <BridgeRow label={x.identifiedOperatingExpense} value={analysis.expenseClassificationTotals.OPERATING_EXPENSE} />
                  <BridgeRow label={x.wages} value={analysis.expenseClassificationTotals.WAGES} />
                  <BridgeRow label={x.payrollRelated} value={analysis.expenseClassificationTotals.PAYROLL_RELATED} />
                  <BridgeRow label={x.personPayments} value={analysis.expenseClassificationTotals.PERSON_PAYMENT} />
                  <BridgeRow label={x.relatedEntity} value={analysis.expenseClassificationTotals.RELATED_ENTITY_FLOW} />
                  <BridgeRow label={x.bankFees} value={analysis.expenseClassificationTotals.BANK_FEE} />
                  <div className="border-t pt-3"><BridgeRow label={x.unknownOutflows} value={analysis.outflowStillToClassify} strong /></div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{x.operatingByNature}</h3>
                  <p className="mt-1 text-sm text-gray-500">{x.operatingByNatureHelp}</p>
                </div>
                <Link href={`/banki/arsgreining?year=${year}&view=expenses`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">{x.openExpenseAnalysis}</Link>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{x.item}</th><th className="p-2 text-right">{x.fromBankData}</th><th className="p-2">{x.status}</th></tr></thead>
                  <tbody>
                    {[
                      ["PREMISES", t.premises], ["UTILITIES", t.utilities], ["TELECOM", t.telecom], ["SOFTWARE", t.software],
                      ["INSURANCE", t.insurance], ["VEHICLE", t.vehicle], ["TRAVEL", t.travel], ["ADVERTISING", t.advertising],
                      ["TRANSPORT", t.transport], ["GOODS_SERVICES", t.goodsServices], ["DINING", t.dining], ["GROCERY_PURCHASE", t.groceryPurchase],
                      ["OFFICE_SUPPLIES", t.officeSupplies], ["RESALE_GOODS", t.resaleGoods], ["EVENT_HOSPITALITY", t.eventHospitality],
                      ["SPORTS_EVENT", t.sportsEvent], ["SPORTS_EQUIPMENT", t.sportsEquipment], ["TELECOM_EQUIPMENT", t.telecomEquipment],
                      ["POS_PAYMENT_SERVICE", t.posPaymentService], ["ADMIN_REGISTRATION_FEE", t.adminRegistrationFee],
                    ].map(([category, label]) => {
                      const amount = analysis.expenseClassificationTotals[category as keyof typeof analysis.expenseClassificationTotals];
                      if (!amount) return null;
                      return <tr key={String(category)} className="border-b last:border-0"><td className="p-2 font-medium">{label}</td><td className="p-2 text-right font-semibold">{formatNumber(Math.round(amount))} kr.</td><td className="p-2 text-slate-600">{x.fromBankData}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              {x.notFinalAccounts}
            </div>
          </section>

          <div className={`${view === "overview" ? "" : "hidden"} mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6`}>
            <Stat label={t.accounts} value={formatNumber(byAccount.length)} />
            <Stat label={t.transactions} value={formatNumber(analysis.transactionCount)} />
            <Stat label={t.inflows} value={`${formatNumber(Math.round(analysis.grossInflows))} kr.`} />
            <Stat label={t.outflows} value={`${formatNumber(Math.round(analysis.grossOutflows))} kr.`} />
            <Stat label={t.net} value={`${formatNumber(Math.round(analysis.netCashFlow))} kr.`} />
            <Stat label={t.aiCost} value={t.zero} />
          </div>

          <section className={`${view === "overview" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.turnoverBridge}</h2>
            <div className="mt-5 max-w-3xl space-y-3">
              <BridgeRow label={t.grossInflows} value={analysis.grossInflows} />
              <BridgeRow label={t.internalTransfers} value={-analysis.likelyInternalInflows} />
              <BridgeRow label={t.interestIncome} value={-analysis.interestIncome} />
              <div className="border-t pt-3">
                <BridgeRow label={t.remaining} value={analysis.inflowStillToClassify} strong />
              </div>
            </div>
            <p className="mt-4 max-w-4xl rounded-lg bg-amber-50 p-4 text-amber-950">{t.remainingHelp}</p>
            <div className="mt-5 rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-gray-500">{t.confirmedTurnover}</p>
              <p className="mt-1 text-lg font-semibold">{t.notYetConfirmed}</p>
            </div>
          </section>

          <section className={`${view === "income" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.incomeClassification}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.incomeClassificationHelp}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Stat label={t.confirmedFromBankText} value={`${formatNumber(Math.round(analysis.confirmedTurnover))} kr.`} />
              <Stat label={t.paymentSettlement} value={`${formatNumber(Math.round(analysis.classificationTotals.PAYMENT_SETTLEMENT))} kr.`} />
              <Stat label={t.grantLinkedInflow} value={`${formatNumber(Math.round(analysis.classificationTotals.GRANT_CONTRIBUTION))} kr.`} />
              <Stat label={t.unknown} value={`${formatNumber(Math.round(analysis.classificationTotals.UNKNOWN))} kr.`} />
            </div>
            <div className="mt-5 rounded-lg border bg-slate-50 p-4">
              <p className="text-sm text-gray-500">{t.likelyTurnover}</p>
              <p className="mt-1 text-xl font-bold">{formatNumber(Math.round(analysis.likelyTurnover))} kr.</p>
            </div>
            {grantFlowIncomingTotal > 0 ? (
              <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <GrantFlowStat label={t.grantLinkedInflow} value={grantFlowIncomingTotal} />
                  <GrantFlowStat label={t.grantPassThrough} value={grantFlowMatchedTotal} />
                  <GrantFlowStat label={t.grantRemainingCandidate} value={grantFlowUnmatchedTotal} />
                </div>
                <p className="mt-3 text-sm text-emerald-950/80">{t.grantRecognitionHelp}</p>
              </div>
            ) : null}
            <div id="tekjulisti" className="mt-5 scroll-mt-24 flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-3">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="view" value="income" />
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.sortBy}</span>
                  <select name="incomeSort" defaultValue={incomeSort} className="rounded-lg border bg-white px-3 py-2">
                    <option value="amount-desc">{t.sortAmount}</option>
                    <option value="count-desc">{t.sortCount}</option>
                    <option value="name-asc">{t.sortName}</option>
                    <option value="confidence-low">{t.sortUncertainFirst}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.classification}</span>
                  <select name="incomeCategory" defaultValue={incomeCategory} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">Allt</option>
                    <option value="OPERATING_REVENUE">{t.operatingRevenue}</option>
                    <option value="GRANT_CONTRIBUTION">{t.grantContribution}</option>
                    <option value="PAYMENT_SETTLEMENT">{t.paymentSettlement}</option>
                    <option value="LOAN_CAPITAL">{t.loanCapital}</option>
                    <option value="REFUND">{t.refunds}</option>
                    <option value="OTHER">{t.other}</option>
                    <option value="UNKNOWN">{t.unknown}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.filterConfidence}</span>
                  <select name="incomeConfidence" defaultValue={incomeConfidence} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">{t.allConfidence}</option>
                    <option value="LOW">{t.low}</option>
                    <option value="MEDIUM">{t.medium}</option>
                    <option value="HIGH">{t.high}</option>
                  </select>
                </label>
                <button className="rounded-lg border bg-white px-4 py-2 font-medium hover:bg-gray-50" type="submit">{t.apply}</button>
              </form>
              <span className="ml-auto text-sm text-gray-500">{formatNumber(visibleIncomeGroups.length)} / {formatNumber(analysis.classifiedIncomeGroups.length)}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.source}</th><th className="p-2">{t.classification}</th><th className="p-2">{t.classificationConfidence}</th><th className="p-2">{t.researchEvidence}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                </thead>
                <tbody>
                  {visibleIncomeGroups.slice(0, 40).map((group) => {
                    const groupTransactions = yearTransactions.filter((item) => group.transactionIds.includes(item.id));
                    const evidenceRows = groupTransactions.map((item) => analyzeIncomeEvidence(item));
                    const hasReferencePattern = group.referencePattern?.signal === "REPEATED_SETTLEMENT_PATTERN";
                    const evidenceCount = groupTransactions.filter((_, index) => {
                      const evidence = evidenceRows[index];
                      return hasReferencePattern || evidence.evidence !== "insufficient-bank-evidence";
                    }).length;
                    const unexplainedCount = Math.max(0, groupTransactions.length - evidenceCount);
                    const strongEvidenceCount = evidenceRows.filter((evidence) =>
                      evidence.evidence !== "insufficient-bank-evidence" && evidence.confidence === "HIGH"
                    ).length;
                    const indicatedEvidenceCount = Math.max(0, evidenceCount - strongEvidenceCount);
                    const researchEvidenceLabel = evidenceCount === 0
                      ? t.researchEvidenceNone
                      : [
                          strongEvidenceCount > 0
                            ? `${formatNumber(strongEvidenceCount)} ${t.strongEvidenceTransactions}`
                            : null,
                          indicatedEvidenceCount > 0
                            ? `${formatNumber(indicatedEvidenceCount)} ${t.transactionsWithEvidence}`
                            : null,
                          `${formatNumber(unexplainedCount)} ${t.unexplainedTransactions}`,
                        ].filter(Boolean).join(" · ");

                    return (
                    <tr key={group.key} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="p-0 font-medium">
                        <Link className="block p-2 text-blue-700 hover:underline" href={drilldownHref("in", group.key)}>{group.label}</Link>
                      </td>
                      <td className="p-0">
                        <Link className="block p-2" href={drilldownHref("in", group.key)}>
                          <div>{classificationLabel(group.classification)}</div>
                          {group.classification === "UNKNOWN" && hasReferencePattern ? (
                            <div className="mt-1 text-xs text-amber-700">
                              {t.repeatedSettlementPatternNeedsConfirmation} · {group.referencePattern?.stem}-* · {group.referencePattern?.variants.join("/")}
                            </div>
                          ) : null}
                        </Link>
                      </td>
                      <td className="p-0"><Link className="block p-2" href={drilldownHref("in", group.key)}>{confidenceLabel(group.confidence)}</Link></td>
                      <td className="p-0"><Link className="block p-2" href={drilldownHref("in", group.key)}>{researchEvidenceLabel}</Link></td>
                      <td className="p-0 text-right"><Link className="block p-2" href={drilldownHref("in", group.key)}>{formatNumber(group.count)}</Link></td>
                      <td className="p-0 text-right font-medium"><Link className="block p-2" href={drilldownHref("in", group.key)}>{formatNumber(Math.round(group.amount))} kr.</Link></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>


          <section className={`${view === "income" ? "" : "hidden"} mt-8 overflow-hidden rounded-2xl border-2 border-emerald-200 bg-emerald-50/40`}>
            <div className="border-b border-emerald-200 bg-emerald-100/70 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-emerald-950">{t.grantFlowTitle}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-emerald-900/80">{t.grantFlowHelp}</p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 text-right">
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">{t.grantFlowCandidateTotal}</p>
                  <p className="mt-1 text-xl font-bold text-emerald-950">{formatNumber(Math.round(grantFlowIncomingTotal))} kr.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <GrantFlowStat label={t.grantFlowIncoming} value={grantFlowIncomingTotal} />
                <GrantFlowStat label={t.grantFlowStrongMatched} value={grantFlowMatchedTotal} />
                <GrantFlowStat label={t.grantFlowUnmatched} value={grantFlowUnmatchedTotal} />
              </div>
            </div>

            {grantFlows.length === 0 ? (
              <p className="p-6 text-sm text-gray-600">{t.noGrantFlow}</p>
            ) : (
              <div className="space-y-5 p-6">
                {grantFlows.slice(0, 30).map((flow) => (
                  <div key={flow.key} className="rounded-xl border bg-white p-5 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.35fr)] lg:items-center">
                      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-sky-700">{t.grantFlowFrom}</p>
                        <Link className="mt-1 block font-semibold text-blue-700 hover:underline" href={drilldownHref("in", flow.key)}>
                          {flow.label}
                        </Link>
                        <p className="mt-2 text-2xl font-bold">{formatNumber(Math.round(flow.incomingAmount))} kr.</p>
                        <p className="mt-1 text-xs text-gray-600">
                          {formatNumber(flow.incomingCount)} {t.grantFlowPayments} · {flow.basis === "BANK_TEXT" ? t.grantFlowBasisBankText : flow.basis === "BOTH" ? t.grantFlowBasisBoth : t.grantFlowBasisAccount}
                        </p>
                      </div>

                      <div className="hidden px-2 text-3xl text-emerald-600 lg:block" aria-hidden="true">→</div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.grantFlowWhere}</p>
                        {flow.destinations.length ? flow.destinations.map((destination) => (
                          <div key={`${flow.key}-${destination.label}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                            <div>
                              <p className="font-semibold text-emerald-950">{destination.label}</p>
                              <p className="text-xs text-emerald-800">{t.grantFlowStrongPair} · {formatNumber(destination.count)} {t.grantFlowPairs}</p>
                            </div>
                            <p className="font-bold text-emerald-950">{formatNumber(Math.round(destination.amount))} kr.</p>
                          </div>
                        )) : (
                          <div className="rounded-lg border border-dashed p-3 text-sm text-gray-600">{t.grantFlowNoDestination}</div>
                        )}
                        {flow.unmatchedAmount > 0 ? (
                          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
                            <span className="text-sm font-medium">{t.grantFlowUnmatched}</span>
                            <strong>{formatNumber(Math.round(flow.unmatchedAmount))} kr.</strong>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                <p className="rounded-lg bg-white/70 p-4 text-sm text-gray-700">{t.grantFlowCaution}</p>
              </div>
            )}
          </section>

          <section className={`${view === "expenses" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.expenseClassification}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.expenseClassificationHelp}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Stat label={t.operatingExpense} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.OPERATING_EXPENSE))} kr.`} />
              <Stat label={t.wages} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.WAGES))} kr.`} />
              <Stat label={t.payrollRelated} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.PAYROLL_RELATED))} kr.`} />
              <Stat
                label={t.personPayments}
                value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.PERSON_PAYMENT))} kr.`}
                href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=PERSON_PAYMENT&expenseSort=amount-desc#utgjaldalisti`}
              />
              <Stat label={t.bankFee} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.BANK_FEE))} kr.`} />
              <Stat label={t.cashWithdrawal} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.CASH_WITHDRAWAL))} kr.`} />
              <Stat label={t.assetInvestment} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.ASSET_INVESTMENT))} kr.`} />
              <Stat label={t.taxFinancial} value={`${formatNumber(Math.round(analysis.expenseClassificationTotals.TAX_FINANCIAL))} kr.`} />
              <Stat
                label={t.expenseUnknown}
                value={`${formatNumber(Math.round(analysis.outflowStillToClassify))} kr.`}
                href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=UNKNOWN&expenseSort=amount-desc#utgjaldalisti`}
                hint={x.viewWhatForms}
              />
            </div>
            <div className="mt-4 rounded-lg border bg-slate-50 p-4">
              <div className="mb-3 text-sm font-semibold text-gray-700">{t.operatingExpense}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["PREMISES", t.premises, analysis.expenseClassificationTotals.PREMISES],
                  ["UTILITIES", t.utilities, analysis.expenseClassificationTotals.UTILITIES],
                  ["TELECOM", t.telecom, analysis.expenseClassificationTotals.TELECOM],
                  ["SOFTWARE", t.software, analysis.expenseClassificationTotals.SOFTWARE],
                  ["INSURANCE", t.insurance, analysis.expenseClassificationTotals.INSURANCE],
                  ["VEHICLE", t.vehicle, analysis.expenseClassificationTotals.VEHICLE],
                  ["TRAVEL", t.travel, analysis.expenseClassificationTotals.TRAVEL],
                  ["ADVERTISING", t.advertising, analysis.expenseClassificationTotals.ADVERTISING],
                  ["TRANSPORT", t.transport, analysis.expenseClassificationTotals.TRANSPORT],
                  ["GOODS_SERVICES", t.goodsServices, analysis.expenseClassificationTotals.GOODS_SERVICES],
                  ["DINING", t.dining, analysis.expenseClassificationTotals.DINING],
                  ["GROCERY_PURCHASE", t.groceryPurchase, analysis.expenseClassificationTotals.GROCERY_PURCHASE],
                  ["OFFICE_SUPPLIES", t.officeSupplies, analysis.expenseClassificationTotals.OFFICE_SUPPLIES],
                  ["RESALE_GOODS", t.resaleGoods, analysis.expenseClassificationTotals.RESALE_GOODS],
                  ["EVENT_HOSPITALITY", t.eventHospitality, analysis.expenseClassificationTotals.EVENT_HOSPITALITY],
                  ["SPORTS_EVENT", t.sportsEvent, analysis.expenseClassificationTotals.SPORTS_EVENT],
                  ["SPORTS_EQUIPMENT", t.sportsEquipment, analysis.expenseClassificationTotals.SPORTS_EQUIPMENT],
                  ["TELECOM_EQUIPMENT", t.telecomEquipment, analysis.expenseClassificationTotals.TELECOM_EQUIPMENT],
                  ["POS_PAYMENT_SERVICE", t.posPaymentService, analysis.expenseClassificationTotals.POS_PAYMENT_SERVICE],
                  ["ADMIN_REGISTRATION_FEE", t.adminRegistrationFee, analysis.expenseClassificationTotals.ADMIN_REGISTRATION_FEE],
                  ["GRANT", t.grants, analysis.expenseClassificationTotals.GRANT],
                  ["CONTRIBUTION", t.contributions, analysis.expenseClassificationTotals.CONTRIBUTION],
                  ["COST_ALLOWANCE", t.costAllowances, analysis.expenseClassificationTotals.COST_ALLOWANCE],
                ].map(([category, label, amount]) => (
                  <Link
                    key={String(category)}
                    href={`/banki/arsgreining?year=${year}&view=expenses&expenseCategory=${category}&expenseSort=amount-desc#utgjaldalisti`}
                    className="block rounded-lg bg-white px-3 py-2 text-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title={`${x.viewTransactionsIn} ${String(label)}`}
                  >
                    <div className="text-gray-500">{label}</div>
                    <div className="mt-1 font-semibold">{formatNumber(Math.round(Number(amount)))} kr.</div>
                    <div className="mt-1 text-xs font-medium text-blue-700">{x.viewTransactions}</div>
                  </Link>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border bg-slate-50 p-3">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="year" value={year} />
                <input type="hidden" name="view" value="expenses" />
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.searchCounterparty}</span>
                  <input name="q" defaultValue={searchQuery} placeholder={t.searchPlaceholder} className="w-64 rounded-lg border bg-white px-3 py-2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.sortBy}</span>
                  <select name="expenseSort" defaultValue={expenseSort} className="rounded-lg border bg-white px-3 py-2">
                    <option value="amount-desc">{t.sortAmount}</option>
                    <option value="count-desc">{t.sortCount}</option>
                    <option value="name-asc">{t.sortName}</option>
                    <option value="confidence-low">{t.sortUncertainFirst}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.filterConfidence}</span>
                  <select name="expenseConfidence" defaultValue={expenseConfidence} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">{t.allConfidence}</option>
                    <option value="LOW">{t.low}</option>
                    <option value="MEDIUM">{t.medium}</option>
                    <option value="HIGH">{t.high}</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="mb-1 block font-medium text-gray-600">{t.filterCategory}</span>
                  <select key={expenseCategory} name="expenseCategory" defaultValue={expenseCategory} className="rounded-lg border bg-white px-3 py-2">
                    <option value="ALL">{t.allCategories}</option>
                    <option value="WAGES">{t.wages}</option>
                    <option value="PAYROLL_RELATED">{t.payrollRelated}</option>
                    <option value="PERSON_PAYMENT">{t.personPayments}</option>
                    <option value="PREMISES">{t.premises}</option>
                    <option value="UTILITIES">{t.utilities}</option>
                    <option value="TELECOM">{t.telecom}</option>
                    <option value="SOFTWARE">{t.software}</option>
                    <option value="INSURANCE">{t.insurance}</option>
                    <option value="VEHICLE">{t.vehicle}</option>
                    <option value="TRAVEL">{t.travel}</option>
                    <option value="ADVERTISING">{t.advertising}</option>
                    <option value="TRANSPORT">{t.transport}</option>
                    <option value="GOODS_SERVICES">{t.goodsServices}</option>
                    <option value="DINING">{t.dining}</option>
                    <option value="GROCERY_PURCHASE">{t.groceryPurchase}</option>
                    <option value="OFFICE_SUPPLIES">{t.officeSupplies}</option>
                    <option value="RESALE_GOODS">{t.resaleGoods}</option>
                    <option value="EVENT_HOSPITALITY">{t.eventHospitality}</option>
                    <option value="SPORTS_EVENT">{t.sportsEvent}</option>
                    <option value="SPORTS_EQUIPMENT">{t.sportsEquipment}</option>
                    <option value="TELECOM_EQUIPMENT">{t.telecomEquipment}</option>
                    <option value="RELATED_ENTITY_FLOW">{t.relatedEntityFlow}</option>
                    <option value="GRANT">{t.grants}</option>
                    <option value="CONTRIBUTION">{t.contributions}</option>
                    <option value="COST_ALLOWANCE">{t.costAllowances}</option>
                    <option value="BANK_FEE">{t.bankFee}</option>
                    <option value="CASH_WITHDRAWAL">{t.cashWithdrawal}</option>
                    <option value="ASSET_INVESTMENT">{t.assetInvestment}</option>
                    <option value="TAX_FINANCIAL">{t.taxFinancial}</option>
                    <option value="UNKNOWN">{t.expenseUnknown}</option>
                    <option value="MIXED">{t.mixedExpense}</option>
                  </select>
                </label>
                <button className="rounded-lg border bg-white px-4 py-2 font-medium hover:bg-gray-50" type="submit">{t.apply}</button>
              </form>
              <span className="ml-auto text-sm text-gray-500">{formatNumber(visibleExpenseGroups.length)} / {formatNumber(analysis.classifiedExpenseGroups.length)}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.source}</th><th className="p-2">{t.classification}</th><th className="p-2">{t.confidence}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                </thead>
                <tbody>
                  {visibleExpenseGroups.slice(0, 50).map((group) => {
                    const filteredBreakdown = expenseCategory !== "ALL"
                      ? group.breakdown.find((item) => item.classification === expenseCategory) ?? null
                      : null;
                    const shownCount = filteredBreakdown?.count ?? group.count;
                    const shownAmount = filteredBreakdown?.amount ?? group.amount;
                    const shownClassification = filteredBreakdown?.classification ?? group.classification;

                    return (
                      <tr key={group.key} className="border-b last:border-0">
                        <td className="p-2 font-medium">
                          <Link className="text-blue-700 hover:underline" href={drilldownHref("out", group.key)}>
                            {group.label}
                          </Link>
                        </td>
                        <td className="p-2">{expenseClassificationLabel(shownClassification)}</td>
                        <td className="p-2">{confidenceLabel(group.confidence)}</td>
                        <td className="p-2 text-right">{formatNumber(shownCount)}</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(shownAmount))} kr.</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {analysis.recurringExpensePatterns.length ? (
            <section className={`${view === "patterns" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
              <h2 className="text-xl font-semibold">{t.recurringTitle}</h2>
              <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.recurringHelp}</p>
              <div className="mt-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.recurringMonths}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.recurringAverage}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {analysis.recurringExpensePatterns.slice(0, 30).map((pattern) => (
                      <tr key={pattern.groupKey} className="border-b last:border-0">
                        <td className="p-2 font-medium">
                          <Link className="text-blue-700 hover:underline" href={drilldownHref("out", pattern.groupKey)}>
                            {pattern.label}
                          </Link>
                        </td>
                        <td className="p-2 text-right">{formatNumber(pattern.monthCount)}</td>
                        <td className="p-2 text-right">{formatNumber(pattern.count)}</td>
                        <td className="p-2 text-right">{formatNumber(Math.round(pattern.averageAmount))} kr.</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(pattern.amount))} kr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedGroup ? (
            <section id="faerslur" className={`${(selectedFlow === "in" && view === "income") || (selectedFlow === "out" && (view === "expenses" || view === "accounts")) ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl border border-blue-200 bg-blue-50/40 p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{t.drilldown}: {selectedGroup.label}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.drilldownHelp}</p>
                </div>
                <Link href={`/banki/arsgreining?year=${year}&view=${selectedFlow === "in" ? "income" : "expenses"}`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">
                  {t.closeDrilldown}
                </Link>
              </div>
              {selectedAccountTrace.length ? (
                <div className="mt-4 rounded-lg border bg-white p-4">
                  <p className="font-semibold">{selectedFlow === "out" ? t.whereMoneyWent : t.whereMoneyCameFrom}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.externalFlowHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500">
                        <tr><th className="p-2">{t.account}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                      </thead>
                      <tbody>
                        {selectedAccountTrace.map((row) => (
                          <tr key={row.bankAccountId} className="border-b last:border-0">
                            <td className="p-2 font-medium">
                              <Link className="text-blue-700 hover:underline" href={`/banki/${row.bankAccountId}`}>
                                {accountById.get(row.bankAccountId)?.name ?? row.bankAccountId}
                              </Link>
                            </td>
                            <td className="p-2 text-right">{formatNumber(row.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(row.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {selectedFlow === "in" && selectedIntermediaryLinks.length ? (
                <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4 text-violet-950">
                  <p className="font-semibold">{t.intermediaryResearchTitle}</p>
                  <p className="mt-1 text-sm">{t.intermediaryResearchHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-violet-200 text-left">
                        <tr>
                          <th className="p-2">{t.underlyingParty}</th>
                          <th className="p-2">{t.underlyingKennitala}</th>
                          <th className="p-2 text-right">{t.count}</th>
                          <th className="p-2 text-right">{t.amount}</th>
                          <th className="p-2">{t.researchStatus}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedIntermediaryLinks.map((row) => {
                          const underlyingHref = row.groupKey
                            ? `/banki/arsgreining?year=${year}&view=income&flow=in&group=${encodeURIComponent(row.groupKey)}#faerslur`
                            : null;
                          return (
                            <tr key={row.kennitala} className={`border-b border-violet-100 last:border-0 ${underlyingHref ? "hover:bg-violet-100/70" : ""}`}>
                              <td className="p-0 font-medium">
                                {underlyingHref ? <Link className="block p-2 text-blue-700 hover:underline" href={underlyingHref}>{row.name ?? t.unknownUnderlyingParty}</Link> : <span className="block p-2">{row.name ?? t.unknownUnderlyingParty}</span>}
                              </td>
                              <td className="p-0">{underlyingHref ? <Link className="block p-2" href={underlyingHref}>{row.kennitala}</Link> : <span className="block p-2">{row.kennitala}</span>}</td>
                              <td className="p-0 text-right">{underlyingHref ? <Link className="block p-2" href={underlyingHref}>{formatNumber(row.count)}</Link> : <span className="block p-2">{formatNumber(row.count)}</span>}</td>
                              <td className="p-0 text-right font-medium">{underlyingHref ? <Link className="block p-2" href={underlyingHref}>{formatNumber(Math.round(row.amount))} kr.</Link> : <span className="block p-2">{formatNumber(Math.round(row.amount))} kr.</span>}</td>
                              <td className="p-0">{underlyingHref ? <Link className="block p-2" href={underlyingHref}>{t.intermediaryEvidenceOnly}</Link> : <span className="block p-2">{t.intermediaryEvidenceOnly}</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {selectedFlow === "in" && reverseIntermediaryLinks.length ? (
                <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-950">
                  <p className="font-semibold">{t.reverseIntermediaryResearchTitle}</p>
                  <p className="mt-1 text-sm">{t.reverseIntermediaryResearchHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-indigo-200 text-left">
                        <tr>
                          <th className="p-2">{t.sourceCounterparty}</th>
                          <th className="p-2 text-right">{t.count}</th>
                          <th className="p-2 text-right">{t.amount}</th>
                          <th className="p-2">{t.researchStatus}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reverseIntermediaryLinks.map((row, index) => {
                          const href = row.groupKey
                            ? `/banki/arsgreining?year=${year}&view=income&flow=in&group=${encodeURIComponent(row.groupKey)}&relatedTx=${encodeURIComponent(row.transactionIds.join(","))}#faerslur`
                            : null;
                          return (
                            <tr key={`${row.sourceKennitala}:${index}`} className={`border-b border-indigo-100 last:border-0 ${href ? "hover:bg-indigo-100/70" : ""}`}>
                              <td className="p-0 font-medium">{href ? <Link className="block p-2 text-blue-700 hover:underline" href={href}>{row.sourceName}</Link> : <span className="block p-2">{row.sourceName}</span>}</td>
                              <td className="p-0 text-right">{href ? <Link className="block p-2" href={href}>{formatNumber(row.count)}</Link> : <span className="block p-2">{formatNumber(row.count)}</span>}</td>
                              <td className="p-0 text-right font-medium">{href ? <Link className="block p-2" href={href}>{formatNumber(Math.round(row.amount))} kr.</Link> : <span className="block p-2">{formatNumber(Math.round(row.amount))} kr.</span>}</td>
                              <td className="p-0">{href ? <Link className="block p-2" href={href}>{t.intermediaryEvidenceOnly}</Link> : <span className="block p-2">{t.intermediaryEvidenceOnly}</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {selectedFlow === "in" && selectedRecurringBankFields.length ? (
                <div className="mt-4 rounded-lg border bg-white p-4">
                  <p className="font-semibold">{t.recurringBankFieldsTitle}</p>
                  <p className="mt-1 text-sm text-gray-600">{t.recurringBankFieldsHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500">
                        <tr><th className="p-2">{t.bankField}</th><th className="p-2">{t.bankFieldValue}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                      </thead>
                      <tbody>
                        {selectedRecurringBankFields.map((row) => (
                          <tr key={`${row.field}:${row.value}`} className="border-b last:border-0">
                            <td className="p-2 text-gray-600">{row.field}</td>
                            <td className="p-2 font-medium">{row.value}</td>
                            <td className="p-2 text-right">{formatNumber(row.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(row.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {selectedReferenceVariantSummary.length ? (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
                  <p className="font-semibold">{t.referenceVariantResearchTitle}</p>
                  <p className="mt-1 text-sm">{t.referenceVariantResearchHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-amber-200 text-left">
                        <tr>
                          <th className="p-2">{t.referenceVariant}</th>
                          <th className="p-2 text-right">{t.count}</th>
                          <th className="p-2 text-right">{t.amount}</th>
                          <th className="p-2">{t.referenceVariantDateSpan}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReferenceVariantSummary.map((row) => (
                          <tr key={row.variant} className="border-b border-amber-100 last:border-0">
                            <td className="p-2 font-semibold">{selectedIncomeGroup?.referencePattern?.stem}-{row.variant}</td>
                            <td className="p-2 text-right">{formatNumber(row.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(row.amount))} kr.</td>
                            <td className="p-2 whitespace-nowrap">
                              {row.firstDate && row.lastDate ? `${formatDate(row.firstDate)} – ${formatDate(row.lastDate)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selectedReferenceVariantTiming?.transitionCount ? (
                    <div className="mt-4 border-t border-amber-200 pt-3">
                      <p className="font-semibold">{t.referenceVariantTimingTitle}</p>
                      <p className="mt-1 text-sm">{t.referenceVariantTimingHelp}</p>
                      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                        <span><strong>{t.referenceVariantTransitions}:</strong> {formatNumber(selectedReferenceVariantTiming.transitionCount)}</span>
                        <span><strong>{t.referenceVariantSameDay}:</strong> {formatNumber(selectedReferenceVariantTiming.sameDay)}</span>
                        <span><strong>{t.referenceVariantNextDay}:</strong> {formatNumber(selectedReferenceVariantTiming.nextDay)}</span>
                        <span><strong>{t.referenceVariantTwoToSevenDays}:</strong> {formatNumber(selectedReferenceVariantTiming.twoToSevenDays)}</span>
                        <span><strong>{t.referenceVariantOverSevenDays}:</strong> {formatNumber(selectedReferenceVariantTiming.overSevenDays)}</span>
                        <span><strong>{t.referenceVariantMedianGap}:</strong> {selectedReferenceVariantTiming.medianGap ?? "—"}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {selectedRecurringPattern ? (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                  <p className="font-semibold">{t.recurringTitle}</p>
                  <p className="mt-1 text-sm">{t.recurringHelp}</p>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <span><strong>{t.recurringMonths}:</strong> {formatNumber(selectedRecurringPattern.monthCount)}</span>
                    <span><strong>{t.count}:</strong> {formatNumber(selectedRecurringPattern.count)}</span>
                    <span><strong>{t.recurringAverage}:</strong> {formatNumber(Math.round(selectedRecurringPattern.averageAmount))} kr.</span>
                    <span><strong>{t.recurringRange}:</strong> {formatNumber(Math.round(selectedRecurringPattern.minAmount))}–{formatNumber(Math.round(selectedRecurringPattern.maxAmount))} kr.</span>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.date}</th><th className="p-2">{t.account}</th><th className="p-2">{t.text}</th><th className="p-2">{t.paymentNature}</th><th className="p-2">{t.purposeIndication}</th><th className="p-2">{t.bankDetails}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {selectedTransactions.map((item) => {
                      const raw = parseRawBankData(item.sourceRawData);
                      const details = [raw.paymentExplanation, raw.textKey, raw.reference, raw.counterparty]
                        .filter(Boolean)
                        .filter((value, index, values) => values.indexOf(value) === index)
                        .join(" · ");
                      const isRecurring = recurringTransactionIds.has(item.id);
                      const evidence = item.amount < 0 ? analyzeExpenseEvidence(item) : null;
                      const incomeEvidence = item.amount > 0 ? analyzeIncomeEvidence(item) : null;
                      const natureLabel = evidence ? ({
                        CARD_PURCHASE: t.natureCardPurchase, TRANSFER: t.natureTransfer, REFUND: t.natureRefund,
                        GRANT: t.natureGrant, CONTRIBUTION: t.natureContribution, COST_ALLOWANCE: t.natureCostAllowance, BANK_FEE: t.natureBankFee, CASH_WITHDRAWAL: t.natureCashWithdrawal, COLLECTION_FEE: t.natureCollectionFee, OTHER: t.natureOther,
                      } as const)[evidence.paymentNature] : "—";
                      const incomeReferencePattern = item.amount > 0 && selectedIncomeGroup?.referencePattern?.signal === "REPEATED_SETTLEMENT_PATTERN"
                        ? selectedIncomeGroup.referencePattern
                        : null;
                      const rawReferenceCandidates = [raw.reference, raw.paymentExplanation, raw.textKey]
                        .map((value) => String(value ?? "").trim())
                        .filter(Boolean);
                      const referenceMatchesPattern = incomeReferencePattern
                        ? incomeReferencePattern.variants.some((variant) =>
                            rawReferenceCandidates.some((candidate) =>
                              candidate === `${incomeReferencePattern.stem}-${variant}` ||
                              candidate === `${incomeReferencePattern.stem}_${variant}` ||
                              candidate === `${incomeReferencePattern.stem} ${variant}` ||
                              candidate === `${incomeReferencePattern.stem}${variant}`
                            )
                          )
                        : false;
                      const embeddedKennitolas = [raw.paymentExplanation, raw.textKey, raw.reference]
                        .map((value) => String(value ?? ""))
                        .flatMap((value) => value.match(/\b\d{10}\b/g) ?? []);
                      const counterpartyKennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
                      const hasUnderlyingPartyEvidence = embeddedKennitolas.some((kennitala) =>
                        kennitala !== counterpartyKennitala
                      );
                      const incomePurposeLabel = hasUnderlyingPartyEvidence
                        ? t.incomeEvidenceIntermediaryFlow
                        : incomeEvidence?.evidence === "stacked-grant-account-and-text"
                        ? t.incomeEvidenceGrantStacked
                        : incomeEvidence?.evidence === "receiving-account-grant"
                          ? t.incomeEvidenceGrantAccount
                          : incomeEvidence?.evidence === "stacked-event-account-and-text"
                            ? t.incomeEvidenceEventStacked
                            : incomeEvidence?.evidence === "lottery-pool-related-inflow"
                              ? t.incomeEvidenceLotteryPool
                              : incomeEvidence?.evidence === "loan-refund-link-needed"
                                ? t.incomeEvidenceLoanRefundLink
                                : incomeEvidence?.evidence === "payment-settlement"
                                  ? t.incomeEvidencePaymentSettlement
                                  : null;
                      const purposeLabel = evidence ? ({
                        PREMISES: t.premises, UTILITIES: t.utilities, TELECOM: t.telecom, SOFTWARE: t.software,
                        INSURANCE: t.insurance, VEHICLE: t.vehicle, TRAVEL: t.travel, ADVERTISING: t.advertising, TRANSPORT: t.transport, DINING: t.dining, GROCERY_PURCHASE: t.groceryPurchase, OFFICE_SUPPLIES: t.officeSupplies, RESALE_GOODS: t.resaleGoods, EVENT_HOSPITALITY: t.eventHospitality, SPORTS: t.sportsPurpose, SPORTS_EQUIPMENT: t.sportsEquipment, TELECOM_EQUIPMENT: t.telecomEquipment, POS_PAYMENT_SERVICE: t.posPaymentService, ADMIN_REGISTRATION_FEE: t.adminRegistrationFee, PREMIUM_UNSPECIFIED: t.premiumUnspecified,
                        WAGES: t.wages, PAYROLL_RELATED: t.payrollRelated, PERSON_PAYMENT: t.personPayments,
                        GOODS_SERVICES: t.goodsServices, ASSET_INVESTMENT: t.assetInvestment, LOAN_CAPITAL: t.loanCapital, UNKNOWN: t.purposeUnknown,
                      } as const)[evidence.purpose] : incomePurposeLabel
                        ? incomePurposeLabel
                        : referenceMatchesPattern && incomeReferencePattern
                          ? `${t.repeatedSettlementPatternNeedsConfirmation} · ${incomeReferencePattern.stem}-* · ${incomeReferencePattern.variants.join("/")}`
                          : "—";
                      const confidenceLabel = (value: string) => value === "HIGH" ? t.high : value === "MEDIUM" ? t.medium : t.low;
                      const researchHref = transactionResearchHref(item.id);
                      const cellLinkClass = "block h-full w-full px-2 py-3";
                      const isSelectedResearchTransaction = selectedResearchTransaction?.id === item.id;
                      const transactionIntermediaryLinks = selectedIntermediaryLinks.filter((row) => row.transactionIds.includes(item.id));
                      const showLoanRefundResearch = incomeEvidence?.evidence === "loan-refund-link-needed";
                      const showRelatedResearch = selectedFlow === "in" && isSelectedResearchTransaction && (showLoanRefundResearch || transactionIntermediaryLinks.length > 0);
                      return (
                        <Fragment key={item.id}>
                          <tr className={`border-b transition-colors hover:bg-blue-100/70 ${isSelectedResearchTransaction ? "bg-blue-100" : isRecurring ? "bg-emerald-50/60" : ""}`}>
                            <td className="whitespace-nowrap"><Link className={cellLinkClass} href={researchHref}>{formatDate(item.date)}</Link></td>
                            <td><Link className={`${cellLinkClass} font-medium text-blue-700`} href={researchHref}>{accountById.get(item.bankAccountId)?.name ?? item.bankAccountId}</Link></td>
                            <td><Link className={cellLinkClass} href={researchHref}>{item.text || "—"}</Link></td>
                            <td className="whitespace-nowrap"><Link className={cellLinkClass} href={researchHref}>{natureLabel}<div className="text-xs text-gray-500">{evidence ? confidenceLabel(evidence.paymentNatureConfidence) : ""}</div></Link></td>
                            <td className="whitespace-nowrap"><Link className={cellLinkClass} href={researchHref}>{purposeLabel}<div className="text-xs text-gray-500">{evidence ? confidenceLabel(evidence.purposeConfidence) : hasUnderlyingPartyEvidence ? t.medium : incomePurposeLabel && incomeEvidence ? confidenceLabel(incomeEvidence.confidence) : ""}</div></Link></td>
                            <td className="text-gray-600"><Link className={cellLinkClass} href={researchHref}>{details || "—"}</Link></td>
                            <td className="text-right font-medium whitespace-nowrap"><Link className={cellLinkClass} href={researchHref}>{formatNumber(Math.round(item.amount))} kr.</Link></td>
                          </tr>
                          {showRelatedResearch ? (
                            <tr key={`${item.id}-research`} className="border-b bg-gray-50/40">
                              <td colSpan={7} className="p-3">
                                <div className="space-y-3">
                                  {transactionIntermediaryLinks.length ? (
                                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-violet-950">
                                      <p className="font-semibold">{t.intermediaryResearchTitle}</p>
                                      <p className="mt-1 text-sm">{t.intermediaryResearchHelp}</p>
                                      <div className="mt-3 overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                          <thead className="border-b border-violet-200 text-left">
                                            <tr>
                                              <th className="p-2">{t.underlyingParty}</th>
                                              <th className="p-2">{t.underlyingKennitala}</th>
                                              <th className="p-2">{t.researchStatus}</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {transactionIntermediaryLinks.map((row) => {
                                              const underlyingHref = row.groupKey
                                                ? `/banki/arsgreining?year=${year}&view=income&flow=in&group=${encodeURIComponent(row.groupKey)}#faerslur`
                                                : null;
                                              return (
                                                <tr key={`${item.id}:${row.kennitala}`} className={`border-b border-violet-100 last:border-0 ${underlyingHref ? "hover:bg-violet-100/70" : ""}`}>
                                                  <td className="p-0 font-medium">{underlyingHref ? <Link className="block p-2 text-blue-700 hover:underline" href={underlyingHref}>{row.name ?? t.unknownUnderlyingParty}</Link> : <span className="block p-2">{row.name ?? t.unknownUnderlyingParty}</span>}</td>
                                                  <td className="p-0">{underlyingHref ? <Link className="block p-2" href={underlyingHref}>{row.kennitala}</Link> : <span className="block p-2">{row.kennitala}</span>}</td>
                                                  <td className="p-0">{underlyingHref ? <Link className="block p-2" href={underlyingHref}>{t.intermediaryEvidenceOnly}</Link> : <span className="block p-2">{t.intermediaryEvidenceOnly}</span>}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ) : null}
                                  {showLoanRefundResearch ? (
                                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                                    <p className="font-semibold">{t.relatedBankDataTitle}</p>
                                    <p className="mt-1 text-sm text-gray-700">{t.relatedBankDataHelp}</p>
                                    {relatedBankLinks.length ? (
                                      <div className="mt-3 space-y-2 text-sm">
                                        {relatedBankLinks.map(({ target, link }) => {
                                          const candidate = transactionById.get(link.candidateId);
                                          if (!candidate) return null;
                                          const reasons = link.reasons.map((reason) => reason === "SAME_COUNTERPARTY" ? t.relatedReasonCounterparty : reason === "EXACT_AMOUNT" ? t.relatedReasonExactAmount : t.relatedReasonLoanWording).join(" · ");
                                          return (
                                            <div key={`${target.id}-${candidate.id}`} className="rounded border border-blue-100 bg-white p-3">
                                              <div><strong>{t.relatedCandidate}:</strong> {formatDate(candidate.date)} · {accountById.get(candidate.bankAccountId)?.name ?? candidate.bankAccountId} · {candidate.text || "—"} · {formatNumber(Math.round(candidate.amount))} kr.</div>
                                              <div className="mt-2 rounded bg-blue-50 px-3 py-2 font-medium text-blue-950">
                                                <strong>{t.relatedFlow}:</strong> {formatDate(candidate.date)} · {accountById.get(candidate.bankAccountId)?.name ?? candidate.bankAccountId} · {formatNumber(Math.round(candidate.amount))} kr. → {formatDate(target.date)} · {accountById.get(target.bankAccountId)?.name ?? target.bankAccountId} · +{formatNumber(Math.round(Math.abs(target.amount)))} kr.
                                              </div>
                                              <div className="mt-1 text-gray-600">{reasons} · {link.dayDistance} {t.relatedDaysApart} · {link.confidence === "HIGH" ? t.high : t.medium}</div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : <p className="mt-3 text-sm font-medium">{t.relatedBankDataNone}</p>}
                                  </div>
                                  ) : null}
                                  {receiptLinkTargets.length ? (
                                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
                                      <p className="font-semibold">{t.relatedReceiptsTitle}</p>
                                      <p className="mt-1 text-sm text-gray-700">{t.relatedReceiptsHelp}</p>
                                      {relatedReceiptLinks.length ? (
                                        <div className="mt-3 space-y-2 text-sm">
                                          {relatedReceiptLinks.map(({ target, receipt, receiptDate, dayDistance, confidence, reasons }) => (
                                            <div key={`${target.id}-${receipt.id}`} className="rounded border border-violet-100 bg-white p-3">
                                              <div><strong>{t.relatedReceiptCandidate}:</strong>{" "}<Link className="text-blue-700 hover:underline" href={`/fylgiskjol/${receipt.id}`}>{formatDate(receiptDate)} · {receipt.merchantName || receipt.description || `#${receipt.id}`} · {formatNumber(Math.round(Number(receipt.aiAmount ?? receipt.amount)))} kr.</Link></div>
                                              <div className="mt-1 text-gray-600">{reasons.map((reason) => reason === "EXACT_AMOUNT" ? t.relatedReceiptReasonExactAmount : reason === "SAME_KENNITALA" ? t.relatedReceiptReasonKennitala : t.relatedReceiptReasonName).join(" · ")} · {dayDistance} {t.relatedDaysApart} · {confidence === "HIGH" ? t.high : t.medium}</div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : <p className="mt-3 text-sm font-medium">{t.relatedReceiptsNone}</p>}
                                    </div>
                                  ) : null}
                                  {receiptLinkTargets.length ? (
                                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                                      <p className="font-semibold">{t.relatedFinancialEventsTitle}</p>
                                      <p className="mt-1 text-sm text-gray-700">{t.relatedFinancialEventsHelp}</p>
                                      {relatedFinancialEventLinks.length ? (
                                        <div className="mt-3 space-y-2 text-sm">
                                          {relatedFinancialEventLinks.map(({ target, event, eventDate, dayDistance }) => (
                                            <div key={`${target.id}-${event.id}`} className="rounded border border-emerald-100 bg-white p-3">
                                              <div><strong>{t.relatedFinancialEventCandidate}:</strong>{" "}{formatDate(eventDate)} · {event.title || event.eventType} · {formatNumber(Math.round(Math.abs(Number(event.amount))))} kr.</div>
                                              <div className="mt-1 text-gray-600">{t.relatedFinancialEventReasonExactAmount} · {dayDistance} {t.relatedDaysApart} · {t.medium}{event.externalReference ? ` · ${event.externalReference}` : ""}{event.status ? ` · ${event.status}` : ""}</div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : <p className="mt-3 text-sm font-medium">{t.relatedFinancialEventsNone}</p>}
                                    </div>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className={`${view === "flows" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.flowThroughTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.flowThroughHelp}</p>
            {analysis.flowThroughSuggestions.length === 0 ? (
              <p className="mt-4 text-gray-600">{t.noFlowThrough}</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.account}</th><th className="p-2">{t.incomingFrom}</th><th className="p-2">{t.outgoingTo}</th><th className="p-2">{t.dates}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {analysis.flowThroughSuggestions.slice(0, 50).map((pair) => (
                      <tr key={`${pair.incomingIds.join("+")}-${pair.outgoingIds.join("+")}`} className="border-b last:border-0">
                        <td className="p-2">{accountById.get(pair.bankAccountId)?.name ?? pair.bankAccountId}</td>
                        <td className="p-2">{pair.incomingLabel}</td>
                        <td className="p-2">{pair.outgoingLabel}</td>
                        <td className="p-2">{formatDate(pair.incomingDate)} → {formatDate(pair.outgoingDate)}</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(pair.amount))} kr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(researchIncomeCategory || researchExpenseCategory) && (view === "income" || view === "expenses") ? (
            <section id="innsyn-rannsokn" className="mt-8 scroll-mt-24 rounded-xl border-2 border-amber-300 bg-amber-50/50 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">{x.insightResearch}</p>
                  <h2 className="mt-1 text-xl font-semibold">{x.exactResearchTitle}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-gray-600">{x.exactResearchHelp}</p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold">{formatNumber(researchTransactions.length)} {x.transactionsLabel}</div>
                  <div className="text-gray-600">{formatNumber(Math.round(researchTransactionsTotal))} kr.</div>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{x.date}</th><th className="p-2">{x.account}</th><th className="p-2">{x.textLabel}</th><th className="p-2 text-right">{x.amount}</th></tr></thead>
                  <tbody>
                    {researchTransactions.map((item) => {
                      const href = researchTransactionHref(item.id);
                      const linkClass = "block h-full w-full px-2 py-3";
                      return (
                        <tr key={item.id} className="border-b last:border-0 transition-colors hover:bg-amber-100/70">
                          <td className="whitespace-nowrap"><Link href={href} className={linkClass}>{formatDate(item.date)}</Link></td>
                          <td><Link href={href} className={`${linkClass} font-medium text-blue-700`}>{item.bankAccountName ?? item.bankAccountId}</Link></td>
                          <td><Link href={href} className={linkClass}>{item.text}</Link></td>
                          <td className="text-right font-medium whitespace-nowrap"><Link href={href} className={linkClass}>{formatNumber(Math.round(Math.abs(item.amount)))} kr.</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section id="innri-millifaerslur" className={`${view === "flows" ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl ${researchFocus === "internalTransfers" ? "border-2 border-amber-300 bg-amber-50/50" : "border"} p-6`}>
            {researchFocus === "internalTransfers" ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">{x.exactMatch}</p> : null}
            <h2 className="text-xl font-semibold">{t.internalTitle}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.internalHelp}</p>
            {analysis.internalPairs.length === 0 ? (
              <p className="mt-4 text-gray-600">{t.noInternal}</p>
            ) : (
              <>
                {researchFocus === "internalTransfers" ? (
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <span><strong>{formatNumber(analysis.internalPairs.length)}</strong> {x.pairs}</span>
                    <span><strong>{formatNumber(Math.round(analysis.likelyInternalInflows))} kr.</strong> samtals</span>
                  </div>
                ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b text-left text-gray-500">
                    <tr><th className="p-2">{t.from}</th><th className="p-2">{t.to}</th><th className="p-2">{t.dates}</th><th className="p-2 text-right">{t.amount}</th></tr>
                  </thead>
                  <tbody>
                    {analysis.internalPairs.map((pair) => (
                      <tr key={`${pair.outgoingId}-${pair.incomingId}`} className="border-b last:border-0">
                        <td className="p-2">{accountById.get(pair.outgoingAccountId)?.name ?? pair.outgoingAccountId}</td>
                        <td className="p-2">{accountById.get(pair.incomingAccountId)?.name ?? pair.incomingAccountId}</td>
                        <td className="p-2">{formatDate(pair.outgoingDate)} → {formatDate(pair.incomingDate)}</td>
                        <td className="p-2 text-right font-medium">{formatNumber(Math.round(pair.amount))} kr.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>

          <section className={`${view === "income" ? "" : "hidden"} mt-8 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.incomeSources}</h2>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.incomeSourcesHelp}</p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.source}</th><th className="p-2">{t.investigationStatus}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr>
                </thead>
                <tbody>
                  {analysis.incomeGroups.slice(0, 30).map((group) => {
                    const classifiedGroup = analysis.classifiedIncomeGroups.find((item) => item.key === group.key);
                    const groupTransactions = yearTransactions.filter((item) => group.transactionIds.includes(item.id));
                    const evidenceRows = groupTransactions.map((item) => analyzeIncomeEvidence(item));
                    const hasReferencePattern = classifiedGroup?.referencePattern != null;
                    const evidenceCount = groupTransactions.filter((_, index) => {
                      const evidence = evidenceRows[index];
                      return hasReferencePattern || evidence.evidence !== "insufficient-bank-evidence";
                    }).length;
                    const unexplainedCount = Math.max(0, groupTransactions.length - evidenceCount);
                    const statusLabel = evidenceCount > 0 ? t.statusEvidenceFound : t.statusUnexplained;
                    return (
                    <tr key={group.key} className="border-b last:border-0 transition-colors hover:bg-blue-50/70">
                      <td className="p-0 font-medium">
                        <Link className="block p-2 text-blue-700 hover:underline" href={drilldownHref("in", group.key)}>{group.label}</Link>
                      </td>
                      <td className="p-0">
                        <Link className="block p-2" href={drilldownHref("in", group.key)}>
                          <div>{statusLabel}</div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            {formatNumber(evidenceCount)} {t.transactionsWithEvidence} · {formatNumber(unexplainedCount)} {t.unexplainedTransactions}
                          </div>
                        </Link>
                      </td>
                      <td className="p-0 text-right"><Link className="block p-2" href={drilldownHref("in", group.key)}>{formatNumber(group.count)}</Link></td>
                      <td className="p-0 text-right font-medium"><Link className="block p-2" href={drilldownHref("in", group.key)}>{formatNumber(Math.round(group.amount))} kr.</Link></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section id="reikningar" className={`${view === "accounts" ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl border p-6`}>
            <h2 className="text-xl font-semibold">{t.accounts}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b text-left text-gray-500">
                  <tr><th className="p-2">{t.accounts}</th><th className="p-2 text-right">{t.transactions}</th><th className="p-2 text-right">{t.inflows}</th><th className="p-2 text-right">{t.outflows}</th></tr>
                </thead>
                <tbody>
                  {byAccount.map((row) => (
                    <tr key={row.account.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Link className="font-medium text-blue-700 hover:underline" href={accountAnalysisHref(row.account.id)}>
                          {row.account.name}
                        </Link>
                      </td>
                      <td className="p-2 text-right">{formatNumber(row.count)}</td>
                      <td className="p-2 text-right">{formatNumber(Math.round(row.inflows))} kr.</td>
                      <td className="p-2 text-right">{formatNumber(Math.round(row.outflows))} kr.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>



          {selectedAccount && selectedAccountAnalysis ? (
            <section id="reikningsgreining" className={`${view === "accounts" ? "" : "hidden"} mt-8 scroll-mt-24 rounded-xl border-2 border-slate-300 bg-slate-50 p-6`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{t.accountAnalysis}</p>
                  <h2 className="mt-1 text-2xl font-bold">{selectedAccount.name}</h2>
                  <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.accountAnalysisHelp}</p>
                </div>
                <Link href={`/banki/arsgreining?year=${year}&view=accounts#reikningar`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">
                  {t.closeAccountAnalysis}
                </Link>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label={t.accountInflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.inflows))} kr.`} />
                <Stat label={t.accountOutflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.outflows))} kr.`} />
                <Stat label={t.accountNet} value={`${formatNumber(Math.round(selectedAccountAnalysis.netCashFlow))} kr.`} />
                <Stat label={t.transactions} value={formatNumber(selectedAccountAnalysis.transactionCount)} />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Stat label={t.externalInflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.externalInflows))} kr.`} />
                <Stat label={t.externalOutflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.externalOutflows))} kr.`} />
                <Stat label={t.ownAccountInflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.internalInflows))} kr.`} />
                <Stat label={t.ownAccountOutflows} value={`${formatNumber(Math.round(selectedAccountAnalysis.internalOutflows))} kr.`} />
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border bg-white p-4">
                  <h3 className="font-semibold">{t.whereMoneyCameFrom}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.externalFlowHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr></thead>
                      <tbody>
                        {selectedAccountAnalysis.incomingGroups.slice(0, 20).map((group) => (
                          <tr key={group.key} className="border-b last:border-0">
                            <td className="p-2"><Link className="text-blue-700 hover:underline" href={accountFlowDrilldownHref("in", group.key)}>{group.label}</Link></td>
                            <td className="p-2 text-right">{formatNumber(group.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(group.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border bg-white p-4">
                  <h3 className="font-semibold">{t.whereMoneyWent}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.externalFlowHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr></thead>
                      <tbody>
                        {selectedAccountAnalysis.outgoingGroups.slice(0, 20).map((group) => (
                          <tr key={group.key} className="border-b last:border-0">
                            <td className="p-2"><Link className="text-blue-700 hover:underline" href={accountFlowDrilldownHref("out", group.key)}>{group.label}</Link></td>
                            <td className="p-2 text-right">{formatNumber(group.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(group.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {selectedAccountAnalysis.recurringPatterns.length ? (
                <div className="mt-6 rounded-lg border bg-white p-4">
                  <h3 className="font-semibold">{t.accountRecurring}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.accountRecurringHelp}</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-gray-500"><tr><th className="p-2">{t.source}</th><th className="p-2 text-right">{t.recurringMonths}</th><th className="p-2 text-right">{t.count}</th><th className="p-2 text-right">{t.amount}</th></tr></thead>
                      <tbody>
                        {selectedAccountAnalysis.recurringPatterns.slice(0, 15).map((pattern) => (
                          <tr key={pattern.groupKey} className="border-b last:border-0">
                            <td className="p-2"><Link className="text-blue-700 hover:underline" href={accountFlowDrilldownHref("out", pattern.groupKey)}>{pattern.label}</Link></td>
                            <td className="p-2 text-right">{formatNumber(pattern.monthCount)}</td>
                            <td className="p-2 text-right">{formatNumber(pattern.count)}</td>
                            <td className="p-2 text-right font-medium">{formatNumber(Math.round(pattern.amount))} kr.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">{t.accountAnalysisCaution}</p>
            </section>
          ) : null}

          <section className={`${view === "overview" ? "" : "hidden"} mt-8 rounded-xl border bg-blue-50 p-6 text-blue-950`}>
            <h2 className="font-semibold">{t.next}</h2>
            <p className="mt-2 max-w-4xl">{t.nextHelp}</p>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, href, hint }: { label: string; value: string; href?: string; hint?: string }) {
  const content = (
    <>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {hint ? <p className="mt-2 text-xs font-medium text-blue-700">{hint}</p> : null}
    </>
  );

  return href ? (
    <Link href={href} className="block rounded-lg border p-4 transition hover:border-blue-300 hover:bg-blue-50/40 focus:outline-none focus:ring-2 focus:ring-blue-500">
      {content}
    </Link>
  ) : (
    <div className="rounded-lg border p-4">{content}</div>
  );
}

function GrantFlowStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-emerald-950">{formatNumber(Math.round(value))} kr.</p>
    </div>
  );
}

function BridgeRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? "text-lg font-bold" : ""}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{value < 0 ? "−" : ""}{formatNumber(Math.round(Math.abs(value)))} kr.</span>
    </div>
  );
}
