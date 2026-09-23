import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { getCompanyAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";

import ImageDocumentViewer from "./ImageDocumentViewer";

export default async function FrumskjalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);
  const receiptId = Number(id);

  if (!Number.isFinite(receiptId)) {
    notFound();
  }

  const [access, interfaceLanguage] = await Promise.all([
    getCompanyAccess(companyId),
    getCurrentInterfaceLanguage(),
  ]);

  if (!access) {
    notFound();
  }

  const receipt = await prisma.receipt.findFirst({
    where: {
      id: receiptId,
      companyId,
    },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      storagePath: true,
      company: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!receipt) {
    notFound();
  }

  let originalFileUrl = receipt.filePath ?? null;

  if (receipt.storagePath) {
    const { data } = await supabaseAdmin.storage
      .from("fylgiskjol")
      .createSignedUrl(receipt.storagePath, 60 * 10);

    if (data?.signedUrl) {
      originalFileUrl = data.signedUrl;
    }
  }

  if (!originalFileUrl) {
    notFound();
  }

  const fileName = receipt.fileName?.toLowerCase() ?? "";
  const isPdf = fileName.endsWith(".pdf");

  return (
    <main className="w-full px-3 py-3 md:px-4 md:py-4">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h1 className="text-lg font-semibold text-slate-950">Frumskjal</h1>
              <span className="text-sm text-slate-500">
                {receipt.company.name} · #{receipt.id}
              </span>
            </div>
            {receipt.fileName && (
              <p className="mt-1 truncate text-xs text-slate-500">{receipt.fileName}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/fylgiskjol/${receipt.id}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              ← Til baka
            </Link>

            <a
              href={originalFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Opna eitt og sér ↗
            </a>
          </div>
        </div>

        {isPdf ? (
          <div className="flex justify-center">
            <div className="w-full max-w-[900px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <iframe
                src={originalFileUrl}
                title="Frumskjal"
                className="block h-[calc(100vh-165px)] min-h-[620px] w-full bg-white"
              />
            </div>
          </div>
        ) : (
          <ImageDocumentViewer
            src={originalFileUrl}
            alt="Frumskjal"
            language={interfaceLanguage}
          />
        )}
      </div>
    </main>
  );
}
