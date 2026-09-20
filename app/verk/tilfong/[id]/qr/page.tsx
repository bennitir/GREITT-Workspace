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
    effectiveUser
      ? prisma.userSettings.findUnique({
          where: { userId: effectiveUser.id },
          select: { interfaceLanguage: true },
        })
      : Promise.resolve(null),
    prisma.workResource.findFirst({
      where: { id: resourceId, companyId },
      select: { id: true, kind: true, code: true, name: true, qrToken: true },
    }),
  ]);
  if (!resource?.qrToken) notFound();
  const language = settings?.interfaceLanguage ?? "is";
  const ops = workResourceOperationsText(language);
  const qrUrl = workResourceQrDataUrl(resource.qrToken);
  if (!qrUrl) notFound();

  return (
    <main className="mx-auto max-w-3xl p-5 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <Link href="/verk/tilfong" className="font-semibold text-blue-700">
          ← {ops.qrTitle}
        </Link>
        <PrintQrButton
          label={ops.printQr}
          qrSizeLabel={ops.qrSize}
          qrSizeHelp={ops.qrSizeHelp}
          labelSizeLabel={ops.labelSize}
          labelSizeHelp={ops.labelSizeHelp}
          labelSizeAuto={ops.labelSizeAuto}
        />
      </div>

      <section
        className="mx-auto flex min-h-[28rem] max-w-sm flex-col items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-950 bg-white p-8 text-center print:min-h-0 print:max-w-none print:rounded-xl print:p-[0.35cm]"
        style={{
          width: "var(--gloggt-work-resource-label-width, min(100%, 22rem))",
          height: "var(--gloggt-work-resource-label-height, auto)",
        }}
      >
        <div
          className="font-black uppercase text-slate-950"
          style={{
            fontSize: "clamp(8px, calc(var(--gloggt-work-resource-label-width, 10cm) * 0.035), 14px)",
            letterSpacing: "0.2em",
          }}
        >
          {ops.qrLabelTitle}
        </div>
        <div
          className="mt-2 font-bold uppercase tracking-wide text-slate-500"
          style={{ fontSize: "clamp(7px, calc(var(--gloggt-work-resource-label-width, 10cm) * 0.03), 12px)" }}
        >
          {workResourceKindText(resource.kind, language)} · {resource.code}
        </div>
        <h1
          className="mt-2 font-black text-slate-950"
          style={{ fontSize: "clamp(12px, calc(var(--gloggt-work-resource-label-width, 10cm) * 0.06), 24px)" }}
        >
          {resource.name}
        </h1>
        <img
          src={qrUrl}
          alt={ops.qrTitle}
          className="mt-5 max-h-[70%] max-w-[90%]"
          style={{
            width: "var(--gloggt-work-resource-qr-size, 5cm)",
            height: "var(--gloggt-work-resource-qr-size, 5cm)",
          }}
        />
      </section>
    </main>
  );
}
