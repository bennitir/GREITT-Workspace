"use client";

import { useRef, useState } from "react";
import { createReceipt } from "@/app/actions/receiptActions";
import { useRouter } from "next/navigation";
import TextInput from "@/components/ui/TextInput";
import Button from "@/components/ui/Button";

export default function ReceiptCreateForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    startedAt: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    console.log("handleSubmit keyrði");

    event.preventDefault();

    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);
    const files = selectedFiles;

    if (files.length === 0) {
      setError("Veldu að minnsta kosti eitt fylgiskjal.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setProgress({
      completed: 0,
      total: files.length,
      startedAt: Date.now(),
    });

    let savedCount = 0;
    let skippedCount = 0;
    const failedFiles: File[] = [];
    const otherErrors: string[] = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const receiptData = new FormData();

      for (const [key, value] of formData.entries()) {
        if (key !== "file") {
          receiptData.append(key, value);
        }
      }

      receiptData.append("file", file);

      try {
        await createReceipt(receiptData);
        savedCount++;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Villa kom upp við vistun fylgiskjals.";

        const isDuplicate =
          message.includes("hefur þegar verið sótt");

        if (isDuplicate) {
          skippedCount++;
        } else {
          failedFiles.push(file);
          otherErrors.push(`${file.name}: ${message}`);
        }
      } finally {
        setProgress((current) =>
          current
            ? {
                ...current,
                completed: index + 1,
              }
            : null
        );
      }
    }

    setFiles(failedFiles);

    if (otherErrors.length > 0) {
      setError(
        `Vistað: ${savedCount}. Slept tvíteknum: ${skippedCount}. Villur: ${otherErrors.join(
          " | "
        )}`
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
            ((Date.now() - progress.startedAt) / progress.completed / 1000) *
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
          <div className="rounded border border-red-300 bg-red-50 p-3 text-red-700">
            {error}
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
        <label className="mb-1 block font-medium">
          Fylgiskjal
        </label>

        <input
          ref={fileInputRef}
          name="file"
          type="file"
          accept="application/pdf,image/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            setSelectedFiles(files);
          }}
          className="block w-full rounded-lg border px-3 py-2"
        />
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-3 space-y-2">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${file.size}-${index}`}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <span className="truncate pr-3">{file.name}</span>

              <button
                type="button"
                onClick={() => {
                  const updatedFiles = selectedFiles.filter(
                    (_, fileIndex) => fileIndex !== index
                  );

                  setFiles(updatedFiles);
                }}
                className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50"
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
