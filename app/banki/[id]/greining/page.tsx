import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/locale";
import BankAiAnalyzeButton from "./BankAiAnalyzeButton";
import {
  analyzeBankTransaction,
  buildBankSubpattern,
  buildStructuralBankValueSubpattern,
  decideBankAiUse,
  parseRawBankData,
  type BankAnalysisKind,
} from "@/app/banki/_lib/analysis/transactions";
import {
  bankAnalysisCategoryText,
  bankAnalysisLanguage,
  bankAnalysisText,
} from "@/app/banki/_lib/i18n/analysis-text";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pattern?: string }>;
};

async function getContext() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const companyId = Number(store.get("activeCompanyId")?.value);

  if (!token) redirect("/innskraning?next=/banki");
  if (!Number.isInteger(companyId) || companyId < 1) redirect("/fyrirtaeki");

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    redirect("/innskraning?next=/banki");
  }

  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
    });
    if (!access?.isActive) redirect("/fyrirtaeki");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });

  return {
    companyId,
    language: bankAnalysisLanguage(userSettings?.interfaceLanguage),
  };
}

export default async function BankGreiningPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const selectedPatternKey = String(query.pattern ?? "").trim();
  const bankAccountId = Number(id);
  if (!Number.isInteger(bankAccountId) || bankAccountId < 1) notFound();

  const { companyId, language } = await getContext();
  const t = bankAnalysisText(language);

  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId, isActive: true },
  });
  if (!account) notFound();

  const transactions = await prisma.bankTransaction.findMany({
    where: { bankAccountId: account.id },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  const analyzed = transactions.map((transaction) => {
    const amount = Number(transaction.amount);
    const result = analyzeBankTransaction({
      text: transaction.text,
      amount,
      sourceRawData: transaction.sourceRawData,
    });
    return { transaction, amount, result };
  });

  const safe = analyzed.filter((item) => item.result.resolution === "SAFE_RULE");
  const patternReview = analyzed.filter((item) => item.result.resolution === "PATTERN_REVIEW");
  const unclear = analyzed.filter((item) => item.result.resolution === "UNCLEAR");
  const candidates = analyzed.filter((item) => item.result.resolution !== "SAFE_RULE");

  const groups = new Map<string, {
    patternKey: string;
    kindCounts: Map<BankAnalysisKind, number>;
    count: number;
    amount: number;
    sample: string;
  }>();

  for (const item of analyzed) {
    const patternKey = item.result.patternKey;
    if (!patternKey) continue;
    const current = groups.get(patternKey) ?? {
      patternKey,
      kindCounts: new Map<BankAnalysisKind, number>(),
      count: 0,
      amount: 0,
      sample: item.transaction.text,
    };
    current.count += 1;
    current.amount += item.amount;
    current.kindCounts.set(item.result.kind, (current.kindCounts.get(item.result.kind) ?? 0) + 1);
    groups.set(patternKey, current);
  }

  const repeated = Array.from(groups.values())
    .filter((group) => group.count >= 3)
    .map((group) => {
      const dominant = Array.from(group.kindCounts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "UNKNOWN";
      return { ...group, dominant };
    })
    .sort((a, b) => b.count - a.count || Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 25);

  const selectedItems = selectedPatternKey
    ? analyzed.filter((item) => item.result.patternKey === selectedPatternKey)
    : [];
  const selectedGroup = selectedPatternKey ? groups.get(selectedPatternKey) : undefined;
  const selectedDominant = selectedGroup
    ? Array.from(selectedGroup.kindCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "UNKNOWN"
    : "UNKNOWN";

  const selectedSubgroups = selectedItems.length > 0
    ? (() => {
        type Subgroup = ReturnType<typeof buildBankSubpattern> & { count: number; amount: number; items: typeof selectedItems };
        const exact = selectedItems.reduce((map, item) => {
          const subgroup = buildBankSubpattern({
            text: item.transaction.text,
            amount: item.amount,
            sourceRawData: item.transaction.sourceRawData,
          });
          const current = map.get(subgroup.key) ?? { ...subgroup, count: 0, amount: 0, items: [] as typeof selectedItems };
          current.count += 1;
          current.amount += item.amount;
          current.items.push(item);
          map.set(subgroup.key, current);
          return map;
        }, new Map<string, Subgroup>());

        // Keep genuinely repeated exact bank values (Rapyd-style codes, etc.).
        // Singleton exact values are instead tested for a shared numeric/text
        // structure, preventing settlement IDs from becoming one subgroup per row.
        const regrouped = new Map<string, Subgroup>();
        for (const subgroup of exact.values()) {
          const structural = subgroup.count === 1 ? buildStructuralBankValueSubpattern(subgroup) : null;
          const target = structural ?? subgroup;
          const current = regrouped.get(target.key) ?? { ...target, count: 0, amount: 0, items: [] as typeof selectedItems };
          current.count += subgroup.count;
          current.amount += subgroup.amount;
          current.items.push(...subgroup.items);
          regrouped.set(target.key, current);
        }

        return Array.from(regrouped.values())
          .sort((a, b) => b.count - a.count || Math.abs(b.amount) - Math.abs(a.amount));
      })()
    : [];

  // Deterministic receipt matching: no AI call. Exact absolute amount is required;
  // date proximity and counterparty/merchant text only improve the ranking.
  const selectedReceiptMatches = selectedItems.length > 0
    ? await (async () => {
        const times = selectedItems.map((item) => item.transaction.date.getTime());
        const minDate = new Date(Math.min(...times) - 7 * 86400000);
        const maxDate = new Date(Math.max(...times) + 7 * 86400000);
        const receipts = await prisma.receipt.findMany({
          where: {
            companyId,
            OR: [
              { date: { gte: minDate, lte: maxDate } },
              { aiDate: { gte: minDate, lte: maxDate } },
            ],
          },
          select: {
            id: true, date: true, aiDate: true, amount: true, aiAmount: true,
            description: true, merchantName: true, status: true,
          },
          orderBy: { id: "desc" },
          take: 1000,
        });

        const norm = (value: unknown) => String(value ?? "").toLowerCase()
          .replace(/ð/g, "d").replace(/þ/g, "th").replace(/æ/g, "ae")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

        return selectedItems.map((item) => {
          const raw = parseRawBankData(item.transaction.sourceRawData);
          const counterparty = norm(raw.counterparty);
          const bankDate = item.transaction.date.getTime();
          const amount = Math.abs(item.amount);
          const matches = receipts.flatMap((receipt) => {
            const receiptAmounts = [receipt.aiAmount, receipt.amount]
              .filter((value): value is number => typeof value === "number")
              .map((value) => Math.abs(value));
            if (!receiptAmounts.some((value) => Math.abs(value - amount) < 0.005)) return [];
            const receiptDate = receipt.aiDate ?? receipt.date;
            if (!receiptDate) return [];
            const days = Math.abs(receiptDate.getTime() - bankDate) / 86400000;
            if (days > 7) return [];
            const merchant = norm(receipt.merchantName ?? receipt.description);
            const nameMatch = Boolean(counterparty && merchant && (counterparty.includes(merchant) || merchant.includes(counterparty)));
            const score = 70 + (days < 0.5 ? 20 : days <= 3 ? 15 : 10) + (nameMatch ? 10 : 0);
            return [{ receipt, days, nameMatch, score }];
          }).sort((a, b) => b.score - a.score || a.days - b.days).slice(0, 3);
          return { item, matches };
        });
      })()
    : [];

  const receiptMatchCount = selectedReceiptMatches.reduce((sum, row) => sum + (row.matches.length ? 1 : 0), 0);

  return (
    <main className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">🔎 {t.title}</h1>
          <p className="mt-2 text-gray-600">{account.name} · {account.bankName}</p>
        </div>
        <Link href={`/banki/${account.id}`} className="rounded-lg border px-4 py-2 font-medium">
          ← {t.back}
        </Link>
      </div>

      <p className="mt-5 max-w-4xl rounded-lg bg-blue-50 p-4 text-blue-950">
        {t.subtitle}
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">{t.total}</p>
          <p className="mt-1 text-2xl font-bold">{formatNumber(analyzed.length)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">{t.safe}</p>
          <p className="mt-1 text-2xl font-bold">{formatNumber(safe.length)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">{t.patternReview}</p>
          <p className="mt-1 text-2xl font-bold">{formatNumber(patternReview.length)}</p>
          <p className="mt-2 text-xs text-gray-500">{t.unclear}: {formatNumber(unclear.length)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-gray-500">{t.aiCost}</p>
          <p className="mt-1 text-2xl font-bold">{t.zero}</p>
        </div>
      </div>

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">{t.patterns}</h2>
        <p className="mt-2 text-sm text-gray-600">{t.patternsHelp}</p>

        {repeated.length === 0 ? (
          <p className="mt-5 text-gray-600">{t.noPatterns}</p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">{t.pattern}</th>
                    <th className="p-2">{t.category}</th>
                    <th className="p-2">{t.status}</th>
                    <th className="p-2 text-right">{t.count}</th>
                    <th className="p-2 text-right">{t.netAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {repeated.map((group) => (
                    <tr key={group.patternKey} className="border-b align-top">
                      <td className="p-2">
                        <Link
                          href={`/banki/${account.id}/greining?pattern=${encodeURIComponent(group.patternKey)}#mynstur-skodun`}
                          className="font-medium text-blue-700 underline-offset-2 hover:underline"
                        >
                          {group.sample}
                        </Link>
                        <p className="mt-1 max-w-xl break-all text-xs text-gray-500">{group.patternKey}</p>
                      </td>
                      <td className="p-2">{bankAnalysisCategoryText(language, group.dominant)}</td>
                      <td className="p-2">{
                        group.dominant === "BANK_FEE" || group.dominant === "INTEREST_INCOME" || group.dominant === "CAPITAL_INCOME_TAX"
                          ? t.safeStatus
                          : group.dominant === "UNKNOWN"
                            ? t.unclearStatus
                            : t.reviewStatus
                      }</td>
                      <td className="p-2 text-right">{formatNumber(group.count)}</td>
                      <td className="p-2 text-right">{formatNumber(group.amount)} kr.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-gray-500">{t.topPatternsOnly}</p>
          </>
        )}
      </section>

      {selectedPatternKey && (
        <section id="mynstur-skodun" className="mt-8 scroll-mt-6 rounded-lg border-2 border-blue-200 bg-blue-50/30 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{t.patternDetail}</h2>
              <p className="mt-1 text-sm text-gray-600">{selectedGroup?.sample ?? selectedPatternKey}</p>
              <p className="mt-1 break-all text-xs text-gray-500">{selectedPatternKey}</p>
            </div>
            <Link href={`/banki/${account.id}/greining`} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">
              {t.closePattern}
            </Link>
          </div>

          {selectedItems.length === 0 ? (
            <p className="mt-5 text-gray-600">{t.patternNotFound}</p>
          ) : (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-sm text-gray-500">{t.count}</p>
                  <p className="mt-1 text-xl font-bold">{formatNumber(selectedItems.length)}</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-sm text-gray-500">{t.netAmount}</p>
                  <p className="mt-1 text-xl font-bold">{formatNumber(selectedItems.reduce((sum, item) => sum + item.amount, 0))} kr.</p>
                </div>
                <div className="rounded-lg border bg-white p-4">
                  <p className="text-sm text-gray-500">{t.category}</p>
                  <p className="mt-1 font-semibold">{bankAnalysisCategoryText(language, selectedDominant)}</p>
                </div>
              </div>

              <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">{t.reviewWarning}</p>

              <div className="mt-5 rounded-lg border bg-white p-4">
                <h3 className="text-lg font-semibold">{t.subpatterns}</h3>
                <p className="mt-1 text-sm text-gray-600">{t.subpatternsHelp}</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="p-2">{t.subpattern}</th>
                        <th className="p-2">{t.direction}</th>
                        <th className="p-2 text-right">{t.count}</th>
                        <th className="p-2 text-right">{t.netAmount}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSubgroups.map((subgroup) => (
                        <React.Fragment key={subgroup.key}>
                          <tr className="border-b">
                            <td className="p-2">
                              <span className="font-medium">{subgroup.label}</span>
                              <p className="mt-1 text-xs text-gray-500">{subgroup.key}</p>
                            </td>
                            <td className="p-2">{subgroup.direction === "IN" ? t.incoming : subgroup.direction === "OUT" ? t.outgoing : t.zeroDirection}</td>
                            <td className="p-2 text-right">{formatNumber(subgroup.count)}</td>
                            <td className="p-2 text-right">{formatNumber(subgroup.amount)} kr.</td>
                          </tr>
                          <tr className="border-b">
                            <td colSpan={4} className="px-2 pb-4">
                              {(() => {
                                const subgroupIds = new Set(subgroup.items.map((item) => item.transaction.id));
                                const receiptCandidates = selectedReceiptMatches.filter((row) => subgroupIds.has(row.item.transaction.id) && row.matches.length > 0).length;
                                const ai = decideBankAiUse({
                                  dominantKind: selectedDominant,
                                  basis: subgroup.basis,
                                  receiptCandidateCount: receiptCandidates,
                                  count: subgroup.count,
                                });
                                const reason = ai.reason === "SAFE_RULE" ? t.aiReasonSafe
                                  : ai.reason === "RECEIPT_CANDIDATE" ? t.aiReasonReceipt
                                  : ai.reason === "GENERIC_DATA" ? t.aiReasonGeneric
                                  : ai.reason === "STRUCTURAL_DATA" ? t.aiReasonStructural
                                  : t.aiReasonUseful;
                                const title = ai.decision === "AI_NOT_NEEDED" ? t.aiNotNeeded
                                  : ai.decision === "WAIT_FOR_DATA" ? t.aiWaitForData
                                  : t.aiCanHelp;
                                return <div className={`mt-3 rounded-lg border p-3 text-sm ${ai.decision === "AI_CAN_HELP" ? "border-violet-200 bg-violet-50" : "border-gray-200 bg-gray-50"}`}>
                                  <p className="font-semibold">{title}</p>
                                  <p className="mt-1 text-gray-700">{reason}</p>
                                  {ai.decision === "AI_CAN_HELP" && <BankAiAnalyzeButton
                                    bankAccountId={account.id}
                                    patternKey={selectedPatternKey}
                                    subpatternKey={subgroup.key}
                                    label={subgroup.label}
                                    buttonText={t.aiAnalyzeButton}
                                  />}
                                </div>;
                              })()}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-gray-500">{t.subpatternsWarning}</p>
              </div>

              <div className="mt-5 rounded-lg border bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{t.receiptMatching}</h3>
                    <p className="mt-1 text-sm text-gray-600">{t.receiptMatchingHelp}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium">
                    {receiptMatchCount} / {selectedItems.length} {t.transactionsWithCandidate}
                  </span>
                </div>
                {receiptMatchCount === 0 ? (
                  <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{t.noReceiptMatches}</p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead><tr className="border-b bg-gray-50">
                        <th className="p-2">{t.bankTransaction}</th><th className="p-2">{t.possibleReceipt}</th>
                        <th className="p-2">{t.matchBasis}</th><th className="p-2 text-right">{t.matchScore}</th>
                      </tr></thead>
                      <tbody>
                        {selectedReceiptMatches.filter((row) => row.matches.length).slice(0, 50).map(({ item, matches }) => (
                          <tr key={item.transaction.id} className="border-b align-top">
                            <td className="p-2">
                              <div>{formatDate(item.transaction.date)} · {formatNumber(item.amount)} kr.</div>
                              <div className="mt-1 text-xs text-gray-500">{item.transaction.text}</div>
                            </td>
                            <td className="p-2">
                              {matches.map((match) => (
                                <div key={match.receipt.id} className="mb-2 last:mb-0">
                                  <Link href={`/fylgiskjol/${match.receipt.id}`} className="font-medium text-blue-700 hover:underline">
                                    #{match.receipt.id} · {match.receipt.merchantName ?? match.receipt.description ?? t.receipt}
                                  </Link>
                                  <div className="text-xs text-gray-500">{match.receipt.status}</div>
                                </div>
                              ))}
                            </td>
                            <td className="p-2">
                              {matches.map((match) => (
                                <div key={match.receipt.id} className="mb-2 last:mb-0">
                                  {t.exactAmount} · {match.days < 0.5 ? t.sameDay : `${Math.round(match.days)} ${t.daysApart}`}
                                  {match.nameMatch ? ` · ${t.nameMatch}` : ""}
                                </div>
                              ))}
                            </td>
                            <td className="p-2 text-right font-medium">{matches[0]?.score ?? 0}/100</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-xs text-amber-800">{t.receiptMatchWarning}</p>
              </div>

              <div className="mt-5 overflow-x-auto rounded-lg border bg-white">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-2">{t.date}</th>
                      <th className="p-2">{t.transactionText}</th>
                      <th className="p-2">{t.explanation}</th>
                      <th className="p-2">{t.kennitala}</th>
                      <th className="p-2 text-right">{t.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.slice(0, 50).map(({ transaction, amount }) => {
                      const raw = parseRawBankData(transaction.sourceRawData);
                      return (
                        <tr key={transaction.id} className="border-b align-top">
                          <td className="whitespace-nowrap p-2">{formatDate(transaction.date)}</td>
                          <td className="p-2">{transaction.text}</td>
                          <td className="p-2">{String(raw.paymentExplanation ?? raw.textKey ?? "—")}</td>
                          <td className="whitespace-nowrap p-2">{String(raw.counterpartyKennitala ?? "—")}</td>
                          <td className="whitespace-nowrap p-2 text-right">{formatNumber(amount)} kr.</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {selectedItems.length > 50 && <p className="mt-3 text-sm text-gray-500">{t.firstFifty}</p>}
            </>
          )}
        </section>
      )}

      <section className="mt-8 rounded-lg border p-6">
        <h2 className="text-xl font-semibold">{t.candidates}</h2>
        {candidates.length === 0 ? (
          <p className="mt-4 text-gray-600">{t.noCandidates}</p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Dagsetning</th>
                    <th className="p-2">Texti</th>
                    <th className="p-2">Kennitala</th>
                    <th className="p-2 text-right">Upphæð</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.slice(0, 25).map(({ transaction, amount }) => {
                    const raw = parseRawBankData(transaction.sourceRawData);
                    return (
                      <tr key={transaction.id} className="border-b">
                        <td className="p-2">{formatDate(transaction.date)}</td>
                        <td className="p-2">{transaction.text}</td>
                        <td className="p-2">{String(raw.counterpartyKennitala ?? "—")}</td>
                        <td className="p-2 text-right">{formatNumber(amount)} kr.</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-gray-500">{t.candidatesOnly}</p>
          </>
        )}
      </section>
    </main>
  );
}
