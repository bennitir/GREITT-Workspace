"use client";

import { createReceipt } from "@/app/actions/receiptActions";
import { useEffect, useState } from "react";

export default function MobileCapturePage() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  async function handleSend() {
    if (!selectedFile || isSending) {
      return;
    }

    setIsSending(true);
    setMessage("");

    try {
      const formData = new FormData();

      formData.set("file", selectedFile);
      formData.set("description", "Fylgiskjal úr síma");
      formData.set("amount", "0");

      await createReceipt(formData);

      setMessage("Fylgiskjalið var sent í GLÖGGT.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Villa kom upp við sendingu.",
      );
    } finally {
      setIsSending(false);
    }
  }

  const fileSizeMb = selectedFile
    ? selectedFile.size / 1024 / 1024
    : null;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-8 pt-5">
        <h1 className="text-2xl font-bold">📷 Taka mynd</h1>

        <p className="mt-2 text-slate-600">
          Taktu mynd af reikningi eða kvittun.
        </p>

        <label className="mt-6 block cursor-pointer rounded-2xl bg-blue-600 p-5 text-center font-bold text-white shadow-sm">
          📷 Taka mynd

          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (!file) {
                setSelectedFile(null);
                setImageUrl(null);
                return;
              }

              setMessage("");
              setSelectedFile(file);
              setImageUrl(URL.createObjectURL(file));
            }}
            className="hidden"
          />
        </label>

        {imageUrl && selectedFile && (
          <div className="mt-6">
            <p className="mb-2 font-medium">Forskoðun</p>

            <img
              src={imageUrl}
              alt="Forskoðun af fylgiskjali"
              className="w-full rounded-2xl border object-contain"
            />

            <div className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
              <div>
                <span className="font-semibold">Skráarstærð:</span>{" "}
                {fileSizeMb?.toFixed(2)} MB
              </div>
              <div>
                <span className="font-semibold">Skráargerð:</span>{" "}
                {selectedFile.type || "óþekkt"}
              </div>
              <div className="break-all">
                <span className="font-semibold">Skráarnafn:</span>{" "}
                {selectedFile.name}
              </div>
            </div>

            {message && (
              <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm font-medium text-slate-700">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={isSending}
              className="mt-4 w-full rounded-2xl bg-green-600 p-4 font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSending ? "Sendi í GLÖGGT..." : "Senda í GLÖGGT"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}