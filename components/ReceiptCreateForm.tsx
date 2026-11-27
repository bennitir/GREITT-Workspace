"use client";

import { useRef, useState } from "react";
import { createReceipt } from "@/app/actions/receiptActions";
import { useRouter } from "next/navigation";
import TextInput from "@/components/ui/TextInput";
import Button from "@/components/ui/Button";
import {
  RECEIPT_MAX_BYTES,
  appendReceiptFiles,
  RECEIPT_SIZE_MESSAGE,
  RECEIPT_EMPTY_MESSAGE,
  RECEIPT_FILE_TYPE_MESSAGE,
  selectReceiptFiles,
} from "@/lib/receipts/file-limits";
import { uploadReceiptFilesIndividually } from "@/lib/receipts/upload-batch";

export default function ReceiptCreateForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hasUnconfirmedUploads, setHasUnconfirmedUploads] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    startedAt: number;
    elapsedMs: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  function setFiles(files: File[]) {
    setSelectedFiles(files);

    if (fileInputRef.current) {
      const dataTransfer = new DataTransfer();

      files.forEach((file) => {
        dataTransfer.items.add(file);
      });

      fileInputRef.current.files = dataTransfer.files;
    }
  }

  function handleFileSelection(candidates: File[]) {
    if (isSubmitting || candidates.length === 0) return;

    const selection = selectReceiptFiles(candidates);
    setFiles(appendReceiptFiles(selectedFiles, selection.acceptedFiles));
    setError(
      [
        selection.hasOversizedFiles ? RECEIPT_SIZE_MESSAGE : "",
        selection.hasEmptyFiles ? RECEIPT_EMPTY_MESSAGE : "",
        selection.hasUnsupportedFiles ? RECEIPT_FILE_TYPE_MESSAGE : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);
    const files = selectedFiles;

    if (files.length === 0) {
      setError("Veldu að minnsta kosti eitt fylgiskjal.");
      return;
    }

    if (files.some((file) => file.size > RECEIPT_MAX_BYTES)) {
      setError(RECEIPT_SIZE_MESSAGE);
      return;
    }

    if (files.some((file) => file.size <= 0)) {
      setError(RECEIPT_EMPTY_MESSAGE);
      return;
    }

    dragDepthRef.current = 0;
    setIsDragging(false);
    setHasUnconfirmedUploads(false);
    setIsSubmitting(true);
    setError("");
    setProgress({
      completed: 0,
      total: files.length,
      startedAt: Date.now(),
      elapsedMs: 0,
    });

    let savedCount = 0;
    let skippedCount = 0;
    const otherErrors: string[] = [];

    const uploadFailures = await uploadReceiptFilesIndividually(
      files,
      async (file) => {
        const receiptData = new FormData();

        for (const [key, value] of formData.entries()) {
          if (key !== "file") {
            receiptData.append(key, value);
          }
        }

        receiptData.append("file", file);

        await createReceipt(receiptData);
        savedCount++;
      },
      () => {
        const settledAt = Date.now();
        setProgress((current) =>
          current
            ? {
                ...current,
                completed: current.completed + 1,
                elapsedMs: Math.max(0, settledAt - current.startedAt),
              }
            : null
        );
      },
    );

    for (const { file, error: err } of uploadFailures) {
      const message =
        err instanceof Error
          ? err.message
          : "Villa kom upp við vistun fylgiskjals.";

      const isDuplicate =
        message.includes("hefur þegar verið sótt");

      if (isDuplicate) {
        skippedCount++;
      } else {
        otherErrors.push(`${file.name}: ${message}`);
      }
    }

    // A network error does not prove that the receipt was not persisted.
    // Never preselect such files for one-click resubmission: the user must
    // verify the receipt list first to avoid inadvertent duplicate ingestion.
    setFiles([]);

    if (otherErrors.length > 0) {
      setHasUnconfirmedUploads(true);
      setError(
        `Vistað: ${savedCount}. Slept tvíteknum: ${skippedCount}. ` +
          `Óstaðfestar niðurstöður: ${otherErrors.join(" | ")}`
      );
      setIsSubmitting(false);
      return;
    }

    if (skippedCount > 0 && savedCount === 0) {
      setError(
        skippedCount === 1
          ? "Þetta skjal hefur þegar verið sótt. Engin ný færsla var stofnuð."
          : `${skippedCount} skjöl höfðu þegar verið sótt. Engar nýjar færslur voru stofnaðar.`
      );
      setIsSubmitting(false);
      return;
    }

    router.push("/fylgiskjol");
    router.refresh();
  }

  const progressPercent =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  const estimatedSecondsRemaining =
    progress && progress.completed >= 2
      ? Math.max(
          0,
          Math.round(
            (progress.elapsedMs / progress.completed / 1000) *
              (progress.total - progress.completed)
          )
        )
      : null;

  const estimatedMinutesRemaining =
    estimatedSecondsRemaining != null
      ? Math.ceil(estimatedSecondsRemaining / 60)
      : null;

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-xl space-y-5"
    >
      <div className="hidden">
        <TextInput
          label="Dagsetning"
          name="date"
          type="date"
        />
      </div>

      <div className="min-h-[58px] mb-4">
        {error && (
          <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}
        {hasUnconfirmedUploads && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
            <p className="text-sm">
              Ekki senda sömu skrár aftur fyrr en þú hefur athugað hvort þær
              séu þegar í fylgiskjalalistanum. Vistun kann að hafa tekist
              þótt villuskilaboð hafi komið fram. Skrárnar eru ekki lengur
              sjálfkrafa valdar til endursendingar.
            </p>
            <button
              type="button"
              onClick={() => router.push("/fylgiskjol")}
              className="mt-2 rounded border border-amber-500 px-3 py-1 text-sm font-medium hover:bg-amber-100"
            >
              Skoða fylgiskjöl
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "none" }}>
        <TextInput
          label="Lýsing"
          name="description"
        />

        <div>
          <label className="block mb-1 font-medium">
            Kvittana-/vörusölunúmer
          </label>

          <input
            type="text"
            name="receiptNumber"
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <TextInput
          label="Upphæð"
          name="amount"
          type="number"
        />
      </div>

      <div>
        <label htmlFor="receipt-upload-files" className="mb-1 block font-medium">
          Fylgiskjal
        </label>

        <div
          className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
            isDragging && !isSubmitting
              ? "border-teal-600 bg-teal-50"
              : "border-slate-300 bg-slate-50"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (isSubmitting) return;
            dragDepthRef.current += 1;
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = isSubmitting ? "none" : "copy";
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) setIsDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dragDepthRef.current = 0;
            setIsDragging(false);
            if (isSubmitting) return;
            const files = Array.from(event.dataTransfer.files);
            if (files.length > 0) handleFileSelection(files);
          }}
        >
          <p className="mb-2 text-sm text-slate-700">
            Dragðu PDF- eða myndskrár hingað eða veldu þær úr tölvunni.
            Nýtt val bætist við fyrri skrár.
          </p>
          <input
            id="receipt-upload-files"
            ref={fileInputRef}
            name="file"
            type="file"
            accept="application/pdf,image/*"
            multiple
            disabled={isSubmitting}
            onChange={(event) => {
              handleFileSelection(Array.from(event.target.files ?? []));
            }}
            className="block w-full rounded-lg border bg-white px-3 py-2 disabled:opacity-60"
          />
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600" aria-live="polite">
              {selectedFiles.length} {selectedFiles.length === 1 ? "skrá valin" : "skrár valdar"}
            </p>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setFiles([])}
              className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              Hreinsa val
            </button>
          </div>
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <span className="truncate pr-3">{file.name}</span>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  const updatedFiles = selectedFiles.filter(
                    (_, fileIndex) => fileIndex !== index
                  );

                  setFiles(updatedFiles);
                }}
                className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                Fjarlægja
              </button>
            </div>
          ))}
        </div>
      )}

      {isSubmitting && progress && (
        <div className="rounded-lg border bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="font-semibold">
              Vistar {progress.completed} af {progress.total}
            </span>
            <span className="font-semibold">
              {progressPercent}%
            </span>
          </div>

          <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <p className="mt-2 text-sm text-slate-600">
            {progress.completed < 2
              ? "Reikna áætlaðan tíma…"
              : progress.completed >= progress.total
                ? "Vistun lokið."
                : `Áætlaður tími eftir: um ${estimatedMinutesRemaining} mín.`}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            Ekki loka eða skipta um síðu meðan vistun stendur yfir.
          </p>
        </div>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Vista fylgiskjöl..." : "Vista fylgiskjal"}
      </Button>
    </form>
  );
}
