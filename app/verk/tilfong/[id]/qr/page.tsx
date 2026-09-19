import Link from "next/link";
import { notFound } from "next/navigation";

import { getEffectiveUser } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { workResourceKindText } from "@/lib/i18n/work-resources";
import { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";
import { prisma } from "@/lib/prisma";
import { workResourceQrDataUrl } from "@/lib/work10/qr";
import PrintQrButton from "./PrintQrButton";

type Props = { params: Promise<{ id: string }> };

export default async function WorkResourceQrPage({ params }: Props) {
  const { id } = await params;
  const resourceId = Number(id);
  if (!Number.isInteger(resourceId)) notFound();
  const companyId = await requireCompanyModule("verk");
  const effectiveUser = await getEffectiveUser();
  const [settings, resource] = await Promise.all([
    effectiveUser ? prisma.userSettings.findUnique({ where: { userId: effectiveUser.id }, select: { interfaceLanguage: true } }) : Promise.resolve(null),
    prisma.workResource.findFirst({ where: { id: resourceId, companyId }, select: { id: true, kind: true, code: true, name: true, qrToken: true } }),
  ]);
  if (!resource?.qrToken) notFound();
  const language = settings?.interfaceLanguage ?? "is";
  const ops = workResourceOperationsText(language);
  const qrUrl = workResourceQrDataUrl(resource.qrToken);
  if (!qrUrl) notFound();

  return (
    <main className="mx-auto max-w-xl p-5 print:p-0">
      <div className="mb-5 flex items-center justify-between gap-3 print:hidden">
        <Link href="/verk/tilfong" className="font-semibold text-blue-700">← {ops.qrTitle}</Link>
        <PrintQrButton label={ops.printQr} />
      </div>
      <section className="mx-auto flex aspect-[4/5] max-w-sm flex-col items-center justify-center rounded-3xl border-2 border-slate-950 bg-white p-8 text-center print:border-2">
        <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-950">{ops.qrLabelTitle}</div>
        <div className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">{workResourceKindText(resource.kind, language)} · {resource.code}</div>
        <h1 className="mt-2 text-2xl font-black text-slate-950">{resource.name}</h1>
        <img src={qrUrl} alt={ops.qrTitle} className="mt-6 aspect-square w-64 max-w-full" />
        <code className="mt-4 text-sm font-bold tracking-wider text-slate-700">{resource.qrToken}</code>
      </section>
    </main>
  );
}
