import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { getCompanyAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { uiText } from "@/lib/i18n/ui";

import ImageDocumentViewer from "./ImageDocumentViewer";

export default async function FrumskjalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; document?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam, document: documentParam } = await searchParams;

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
  const t = uiText(interfaceLanguage);

  const requestedPage = pageParam ? Number(pageParam) : null;
  const focusedPage =
    requestedPage !== null &&
    Number.isInteger(requestedPage) &&
    requestedPage > 0
      ? requestedPage
      : null;
  const selectedDocumentId = documentParam ? Number(documentParam) : null;

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
  const focusedFileUrl =
    isPdf && focusedPage
      ? `${originalFileUrl}#page=${focusedPage}`
      : originalFileUrl;
  const backHref =
    selectedDocumentId && Number.isInteger(selectedDocumentId)
      ? `/fylgiskjol/${receipt.id}?document=${selectedDocumentId}`
      : `/fylgiskjol/${receipt.id}`;

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
              href={backHref}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              ← Til baka
            </Link>

            <a
              href={focusedFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              {focusedPage ? t.openSourcePage : "Opna eitt og sér"} ↗
            </a>
            {focusedPage && (
              <a
                href={originalFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {t.openWholeSource} ↗
              </a>
            )}
          </div>
        </div>

        {focusedPage && (
          <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
            {t.sourcePage}: {focusedPage}
          </div>
        )}

        {isPdf ? (
          <div className="flex justify-center">
            <div className="w-full max-w-[900px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <iframe
                src={focusedFileUrl}
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
