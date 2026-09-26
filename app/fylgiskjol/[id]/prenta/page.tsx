import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getCompanyAccess } from "@/lib/core/access-control";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { receiptPrintText } from "@/lib/i18n/receipt-print";
import { formatDate } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";

import PrintableDetectedDocument from "./PrintableDetectedDocument";

export default async function PrintDetectedDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ document?: string; autoprint?: string }>;
}) {
  const { id } = await params;
  const { document: documentParam, autoprint } = await searchParams;

  const receiptId = Number(id);
  const documentId = documentParam ? Number(documentParam) : NaN;

  if (!Number.isInteger(receiptId) || !Number.isInteger(documentId)) {
    notFound();
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);
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
      companyId: true,
      company: {
        select: {
          name: true,
        },
      },
      aiDetectedDocuments: {
        where: {
          id: documentId,
        },
        take: 1,
        select: {
          id: true,
          merchantName: true,
          date: true,
          pageNumber: true,
          voucherNumber: true,
          bookingEntries: {
            orderBy: {
              id: "asc",
            },
            select: {
              id: true,
              account: true,
              text: true,
              debit: true,
              credit: true,
            },
          },
        },
      },
    },
  });

  if (!receipt) {
    notFound();
  }

  const moduleSettings = await getCompanyModuleSettings(receipt.companyId);
  const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
    (module) => module.id,
  );
  if (!enabledModuleIds.includes("bokhald")) {
    redirect("/");
  }

  const document = receipt.aiDetectedDocuments[0];
  if (!document) {
    notFound();
  }

  // Prentútgáfan á aðeins að bera endanlegt fylgiskjalsnúmer.
  // Fyrir bókun er því ekki hægt að prenta þessa merktu vinnuútgáfu.
  if (document.voucherNumber === null) {
    redirect(`/fylgiskjol/${receipt.id}?document=${document.id}`);
  }

  let sourceUrl = receipt.filePath ?? null;
  if (receipt.storagePath) {
    const { data } = await supabaseAdmin.storage
      .from("fylgiskjol")
      .createSignedUrl(receipt.storagePath, 60 * 10);

    if (data?.signedUrl) {
      sourceUrl = data.signedUrl;
    }
  }

  if (!sourceUrl) {
    notFound();
  }

  const fileName = receipt.fileName?.toLowerCase() ?? "";
  const isPdf = fileName.endsWith(".pdf");
  const sourcePageNumbers =
    isPdf && document.pageNumber !== null ? [document.pageNumber] : null;

  const bookingLines = document.bookingEntries.flatMap((entry) => {
    const lines: Array<{
      id: number;
      account: string;
      text: string;
      side: "DEBIT" | "CREDIT";
      amount: number;
    }> = [];

    if (entry.debit > 0) {
      lines.push({
        id: entry.id * 2,
        account: entry.account,
        text: entry.text,
        side: "DEBIT",
        amount: entry.debit,
      });
    }

    if (entry.credit > 0) {
      lines.push({
        id: entry.id * 2 + 1,
        account: entry.account,
        text: entry.text,
        side: "CREDIT",
        amount: entry.credit,
      });
    }

    return lines;
  });

  const printT = receiptPrintText(interfaceLanguage);

  return (
    <PrintableDetectedDocument
      sourceUrl={sourceUrl}
      isPdf={isPdf}
      sourcePageNumbers={sourcePageNumbers}
      voucherNumber={document.voucherNumber}
      companyName={receipt.company.name}
      merchantName={document.merchantName}
      dateLabel={document.date ? formatDate(document.date) : null}
      bookingLines={bookingLines}
      autoPrint={autoprint !== "0"}
      backHref={`/fylgiskjol/${receipt.id}?document=${document.id}`}
      labels={{
        title: printT.printThisDocument,
        voucherLabel: printT.voucherLabel,
        preparing: printT.preparing,
        printNow: printT.printNow,
        close: printT.close,
        bookingMark: printT.bookingMark,
        bookkeeperMark: printT.bookkeeperMark,
        debit: printT.debit,
        credit: printT.credit,
        renderError: printT.renderError,
        sourcePage: printT.sourcePage,
      }}
    />
  );
}
