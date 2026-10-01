import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import SaleWorkspaceClient from "@/app/sala/SaleWorkspaceClient";
import { getCompanyAccess } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { hasSalesPermission } from "@/lib/core/sales-permissions";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { salesText } from "@/lib/i18n/sales";
import { getSaleDetailReadModel } from "@/lib/sales/read-model";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function SaleDetailPage({ params }: Props) {
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isSafeInteger(saleId) || saleId <= 0) notFound();

  const companyId = await requireCompanyModule("sala");
  const access = await getCompanyAccess(companyId);
  if (!hasSalesPermission(access, "SALE_USE")) redirect("/");

  const [language, sale] = await Promise.all([
    getCurrentInterfaceLanguage(),
    getSaleDetailReadModel(companyId, saleId),
  ]);
  if (!sale) notFound();

  const t = salesText(language);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/sala" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
              ← {t.backToSales}
            </Link>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              {t.sale} #{sale.id}
            </h1>
          </div>
        </header>

        <SaleWorkspaceClient
          sale={sale}
          permissions={{
            canHold: hasSalesPermission(access, "SALE_HOLD"),
            canDiscount: hasSalesPermission(access, "SALE_DISCOUNT"),
          }}
          text={{
            status: t.status,
            branch: t.branch,
            terminal: t.terminal,
            noTerminal: t.noTerminal,
            lines: t.lines,
            noLines: t.noLines,
            description: t.description,
            quantity: t.quantity,
            unit: t.unit,
            unitPrice: t.unitPrice,
            discount: t.discount,
            vatRate: t.vatRate,
            subtotal: t.subtotal,
            net: t.net,
            vat: t.vat,
            total: t.total,
            addLine: t.addLine,
            addingLine: t.addingLine,
            remove: t.remove,
            removing: t.removing,
            hold: t.hold,
            holding: t.holding,
            resume: t.resume,
            resuming: t.resuming,
            finalize: t.finalize,
            finalizing: t.finalizing,
            finalizedHelp: t.finalizedHelp,
            heldHelp: t.heldHelp,
            discountPermission: t.discountPermission,
            actionFailed: t.actionFailed,
            invalidLine: t.invalidLine,
            statuses: { ...t.statuses },
          }}
        />
      </div>
    </main>
  );
}
