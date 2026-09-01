"use client";

import { useState } from "react";

type VatTreatment =
  | "OUTPUT"
  | "INPUT"
  | "EXEMPT"
  | "NONE"
  | "REVIEW"
  | "SYSTEM"
  | "";

type Props = {
  disabled: boolean;

  current: {
    vatTreatment: VatTreatment;
    vatRate: number | null;
    vatDeductiblePercent: number | null;
    vatRequiresConfirmation: boolean;
  };

  suggestion:
    | {
        vatTreatment: VatTreatment;
        vatRate: number | null;
        vatDeductiblePercent: number | null;
        vatRequiresConfirmation: boolean;
      }
    | null;
};

export default function VatSettingsFields({
  disabled,
  current,
  suggestion,
}: Props) {
  const [vatTreatment, setVatTreatment] =
    useState<VatTreatment>(current.vatTreatment);

  const [vatRate, setVatRate] = useState(
    current.vatRate != null
      ? String(current.vatRate)
      : ""
  );

  const [
    vatDeductiblePercent,
    setVatDeductiblePercent,
  ] = useState(
    current.vatDeductiblePercent != null
      ? String(current.vatDeductiblePercent)
      : ""
  );

  const [
    vatRequiresConfirmation,
    setVatRequiresConfirmation,
  ] = useState(
    current.vatRequiresConfirmation
  );

  function applySuggestion() {
    if (!suggestion) {
      return;
    }

    setVatTreatment(
      suggestion.vatTreatment
    );

    setVatRate(
      suggestion.vatRate != null
        ? String(suggestion.vatRate)
        : ""
    );

    setVatDeductiblePercent(
      suggestion.vatDeductiblePercent != null
        ? String(
            suggestion.vatDeductiblePercent
          )
        : ""
    );

    setVatRequiresConfirmation(
      suggestion.vatRequiresConfirmation ||
        suggestion.vatTreatment === "REVIEW"
    );
  }

  return (
    <>
      {suggestion && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <button
            type="button"
            onClick={applySuggestion}
            disabled={disabled}
            className="rounded border border-blue-300 bg-white px-4 py-2 font-medium text-blue-800 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Nota þessa tillögu
          </button>

          <p className="mt-2 text-sm text-blue-800">
            Reitirnir fyllast út en ekkert
            vistast fyrr en ýtt er á
            „Vista VSK-stillingar“.
          </p>
        </div>
      )}

      <div>
        <label
          htmlFor="vatTreatment"
          className="mb-1 block font-medium"
        >
          VSK-meðferð
        </label>

        <select
          id="vatTreatment"
          name="vatTreatment"
          value={vatTreatment}
          onChange={(event) =>
            setVatTreatment(
              event.target.value as VatTreatment
            )
          }
          disabled={disabled}
          className="w-full rounded border border-slate-300 px-3 py-2"
        >
          <option value="" disabled>
            Veldu VSK-meðferð
          </option>

          <option value="OUTPUT">
            Útskattur
          </option>

          <option value="INPUT">
            Innskattur
          </option>

          <option value="EXEMPT">
            Undanþegið
          </option>

          <option value="NONE">
            Engin VSK-meðferð
          </option>

          <option value="REVIEW">
            Þarf yfirferð
          </option>

          <option value="SYSTEM">
            VSK kerfisreikningur
          </option>
        </select>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label
            htmlFor="vatRate"
            className="mb-1 block font-medium"
          >
            VSK %
          </label>

          <select
            id="vatRate"
            name="vatRate"
            value={vatRate}
            onChange={(event) =>
              setVatRate(event.target.value)
            }
            disabled={disabled}
            className="w-full rounded border border-slate-300 px-3 py-2"
          >
            <option value="">
              Veldu VSK-hlutfall
            </option>

            <option value="24">
              24%
            </option>

            <option value="11">
              11%
            </option>
          </select>
        </div>

        <div>
          <label
            htmlFor="vatDeductiblePercent"
            className="mb-1 block font-medium"
          >
            Hlutfall innskatts sem má draga frá
          </label>

          <input
            id="vatDeductiblePercent"
            name="vatDeductiblePercent"
            type="number"
            min="0"
            max="100"
            step="1"
            value={vatDeductiblePercent}
            onChange={(event) =>
              setVatDeductiblePercent(
                event.target.value
              )
            }
            disabled={disabled}
            placeholder="t.d. 100"
            className="w-full rounded border border-slate-300 px-3 py-2"
          />

          <p className="mt-1 text-sm text-slate-500">
            Skildu eftir autt þegar ekki er
            hægt að ákveða frádrátt
            sjálfkrafa.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border bg-slate-50 p-4">
        <input
          name="vatRequiresConfirmation"
          type="checkbox"
          checked={vatRequiresConfirmation}
          onChange={(event) =>
            setVatRequiresConfirmation(
              event.target.checked
            )
          }
          disabled={disabled}
          className="mt-1"
        />

        <span>
          <span className="block font-medium">
            Krefst staðfestingar
          </span>

          <span className="text-sm text-slate-600">
            GLÖGGT má leggja til meðferð, en
            bókari þarf að staðfesta hana áður
            en hún er notuð sjálfvirkt.
          </span>
        </span>
      </label>
    </>
  );
}
