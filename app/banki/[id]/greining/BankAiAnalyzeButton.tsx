"use client";

import { useActionState } from "react";
import { analyzeBankSubpatternWithAI, type BankAiState } from "@/app/banki/ai-actions";

type Props = { bankAccountId: number; patternKey: string; subpatternKey: string; label: string; buttonText: string };

export default function BankAiAnalyzeButton({ bankAccountId, patternKey, subpatternKey, label, buttonText }: Props) {
  const [state, action, pending] = useActionState<BankAiState, FormData>(analyzeBankSubpatternWithAI, null);
  return <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
    <form action={action}>
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <input type="hidden" name="patternKey" value={patternKey} />
      <input type="hidden" name="subpatternKey" value={subpatternKey} />
      <button disabled={pending} className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "AI…" : `${buttonText}: ${label}`}
      </button>
    </form>
    {state?.ok === false && <p className="mt-3 text-sm text-red-700">{state.error}</p>}
    {state?.ok && <div className="mt-4 space-y-2 text-sm">
      <p className="font-semibold">{state.title}</p>
      <p>{state.summary}</p>
      <p><strong>Tillaga:</strong> {state.suggestedCategory}</p>
      <p><strong>Rök:</strong> {state.rationale}</p>
      <p><strong>Vissa:</strong> {state.confidence} · <strong>Mannleg ákvörðun:</strong> {state.needsHumanDecision ? "Já" : "Nei"}</p>
      {!!state.questions?.length && <ul className="list-disc pl-5">{state.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>}
      <p className="border-t border-violet-200 pt-2 text-xs text-gray-600">
        {state.fromCache ? "♻️ Varðveitt fyrri AI-greining — ekkert nýtt AI-kall og 0 kr. viðbótarkostnaður." : `AI-kall: 1 · sýni ${state.sampleCount}/${state.totalGroupCount} færslur · ${state.totalTokens ?? 0} token · áætlaður kostnaður ${Number(state.costIsk ?? 0).toFixed(2)} kr.`}
      </p>
      <p className="text-xs text-gray-600">Fylgiskjalaleit fyrir AI-kall: {state.matchedReceiptCount ?? 0} möguleg fylgiskjöl fundust eftir upphæð og nálægri dagsetningu.</p>
      <p className="text-xs font-medium text-violet-900">Þetta er aðeins tillaga. Ekkert hefur verið bókað eða lært.</p>
      {state.fromCache && <form action={action} className="pt-1">
        <input type="hidden" name="bankAccountId" value={bankAccountId} />
        <input type="hidden" name="patternKey" value={patternKey} />
        <input type="hidden" name="subpatternKey" value={subpatternKey} />
        <input type="hidden" name="forceReanalysis" value="true" />
        <button disabled={pending} className="rounded border border-violet-300 bg-white px-2 py-1 text-xs font-medium text-violet-800 disabled:opacity-50">Endurgreina með AI (nýr kostnaður)</button>
      </form>}
    </div>}
  </div>;
}
