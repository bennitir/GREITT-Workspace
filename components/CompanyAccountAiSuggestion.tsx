"use client";

import { useActionState } from "react";
import {
  suggestCompanyAccountsWithAI,
  type CompanyAccountSuggestionState,
} from "@/app/actions/companyActions";

const initialState: CompanyAccountSuggestionState = {
  status: "IDLE",
  message: "",
  summary: "",
  activeActivities: [],
  suggestions: [],
};

export default function CompanyAccountAiSuggestion({
  companyId,
}: {
  companyId: number;
}) {
  const [state, formAction, pending] = useActionState(
    suggestCompanyAccountsWithAI,
    initialState
  );

  return (
    <div className="mt-5 rounded-lg border border-violet-200 bg-violet-50 p-4">
      <div>
        <h3 className="font-semibold text-violet-950">
          AI-tillaga að reikningslyklum
        </h3>
        <p className="mt-1 text-sm text-violet-800">
          GLÖGGT ber virka starfsemi saman við núverandi
          reikningslykil og leggur aðeins til mögulegar viðbætur.
          Enginn lykill er stofnaður eða breyttur sjálfkrafa.
        </p>
      </div>

      <form action={formAction} className="mt-4">
        <input
          type="hidden"
          name="companyId"
          value={companyId}
        />

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-violet-700 px-4 py-2 font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending
            ? "AI er að skoða reikningslykil..."
            : "Fá tillögu að reikningslyklum"}
        </button>
      </form>

      {state.message && (
        <p
          className={`mt-4 text-sm font-medium ${
            state.status === "ERROR"
              ? "text-red-700"
              : "text-violet-900"
          }`}
        >
          {state.message}
        </p>
      )}

      {state.status === "SUCCESS" && (
        <div className="mt-5 space-y-4">
          {state.activeActivities.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Virk starfsemi sem tillagan byggir á
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {state.activeActivities.map((activity) => (
                  <span
                    key={activity}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700"
                  >
                    {activity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {state.summary && (
            <div className="rounded border bg-white p-3 text-sm text-slate-700">
              {state.summary}
            </div>
          )}

          {state.suggestions.length > 0 ? (
            <div className="space-y-3">
              {state.suggestions.map((suggestion, index) => (
                <div
                  key={`${suggestion.number}-${index}`}
                  className="rounded-lg border bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {suggestion.number} – {suggestion.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Tegund: {suggestion.type}
                        {suggestion.entryRole
                          ? ` · Hlutverk: ${suggestion.entryRole}`
                          : ""}
                      </div>
                    </div>

                    <span className="rounded-full border px-2.5 py-1 text-xs font-medium text-slate-600">
                      Öryggi: {suggestion.confidence}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-700">
                    {suggestion.reason}
                  </p>

                  <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <strong>VSK:</strong>{" "}
                    {suggestion.vatRecommendation}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              AI fann enga augljósa viðbót sem vantar miðað við
              virka starfsemi og núverandi reikningslykil.
            </div>
          )}

          <p className="text-xs text-slate-500">
            Þetta er tillaga til yfirferðar. Engin breyting hefur
            verið gerð á reikningslyklinum.
          </p>
        </div>
      )}
    </div>
  );
}
