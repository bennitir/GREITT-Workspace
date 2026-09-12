import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import ManualReceiptForm from "@/components/ManualReceiptForm";

export default async function ManualReceiptPage() {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId) || companyId <= 0) {
    redirect("/fyrirtaeki");
  }

  const moduleSettings = await getCompanyModuleSettings(companyId);

  const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
    (module) => module.id,
  );

  if (!enabledModuleIds.includes("bokhald")) {
    redirect("/");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { vatRegistered: true },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const [accounts, pendingReceiptRows] = await Promise.all([
    prisma.account.findMany({
      where: {
        companyId,
        isActive: true,
      },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        name: true,
        vatRate: true,
        vatAccount: true,
        vatRequiresConfirmation: true,
        type: true,
        entryRole: true,
      },
    }),
    prisma.receipt.findMany({
      where: {
        companyId,
        status: { not: "APPROVED" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        description: true,
        createdAt: true,
        filePath: true,
        storagePath: true,
        aiDetectedDocuments: {
          where: {
            approvedAt: null,
            disposedAt: null,
            duplicateMarkedAt: null,
          },
          orderBy: { id: "asc" },
          select: {
            id: true,
            merchantName: true,
            receiptNumber: true,
            date: true,
            totalAmount: true,
          },
        },
      },
    }),
  ]);

  const pendingReceipts = (await Promise.all(
    pendingReceiptRows.map(async (receipt) => {
      let originalFileUrl = receipt.filePath ?? null;

      if (receipt.storagePath) {
        const { data } = await supabaseAdmin.storage
          .from("fylgiskjol")
          .createSignedUrl(receipt.storagePath, 60 * 10);

        if (data?.signedUrl) {
          originalFileUrl = data.signedUrl;
        }
      }

      const fallbackLabel = `${receipt.fileName ?? receipt.description ?? `Skjal ${receipt.id}`} · móttekið ${receipt.createdAt.toLocaleDateString("is-IS")}`;

      if (receipt.aiDetectedDocuments.length === 0) {
        return [
        {
          receiptId: receipt.id,
          documentId: null,
          label: fallbackLabel,
          originalFileUrl,
        },
        ];
      }

      return receipt.aiDetectedDocuments.map((document, index) => {
      const identifyingParts = [
        document.merchantName?.trim() || null,
        document.receiptNumber?.trim()
          ? `nr. ${document.receiptNumber.trim()}`
          : null,
        document.date
          ? document.date.toLocaleDateString("is-IS")
          : null,
        document.totalAmount != null
          ? `${document.totalAmount.toLocaleString("is-IS")} kr.`
          : null,
      ].filter((value): value is string => Boolean(value));

      const identityLabel =
        identifyingParts.length > 0
          ? `${identifyingParts.join(" · ")} · ${receipt.fileName ?? `Skjal ${receipt.id}`}`
          : fallbackLabel;

      return {
        receiptId: receipt.id,
        documentId: document.id,
        label:
          receipt.aiDetectedDocuments.length > 1
            ? `${identityLabel} · hluti ${index + 1}`
            : identityLabel,
        originalFileUrl,
      };
      });
    }),
  )).flat();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Handvirk skráning fylgiskjals</h1>
        <p className="mt-1 text-gray-600">
          Bókari getur unnið skjalið sjálfstætt án AI. Fyrirliggjandi óunnið
          skjal fer í yfirferð þegar handvirkum undirbúningi lýkur.
        </p>
      </div>

      <ManualReceiptForm
        accounts={accounts}
        vatRegistered={company.vatRegistered}
        pendingReceipts={pendingReceipts}
      />
    </main>
  );
}
