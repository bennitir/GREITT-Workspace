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
          qrSizeWarning={ops.qrSizeWarning}
          labelSizeLabel={ops.labelSize}
          labelSizeHelp={ops.labelSizeHelp}
          labelSizeAuto={ops.labelSizeAuto}
          printSetupHelp={ops.qrPrintSetupHelp}
          qrUrl={qrUrl}
          resourceCode={resource.code}
          resourceName={resource.name}
          resourceKindLabel={workResourceKindText(resource.kind, language)}
          labelTitle={ops.qrLabelTitle}
        />
      </div>

      <section
        id="gloggt-work-resource-label"
        className="mx-auto box-border flex items-center justify-center overflow-hidden border border-slate-950 bg-white text-center print:m-0"
        style={{
          width: "var(--gloggt-work-resource-label-width, 6.5cm)",
          height: "var(--gloggt-work-resource-label-height, 7cm)",
          padding: "var(--gloggt-work-resource-label-padding-y, 0.2cm) var(--gloggt-work-resource-label-padding-x, 0.2cm)",
          borderRadius: "var(--gloggt-work-resource-label-radius, 0.16cm)",
        }}
      >
        <div
          style={{ display: "var(--gloggt-work-resource-full-label-display, flex)" }}
          className="h-full w-full flex-col items-center justify-center"
        >
          <div
            className="font-black uppercase text-slate-950"
            style={{
              fontSize: "clamp(6px, calc(var(--gloggt-work-resource-label-width, 10cm) * 0.035), 14px)",
              letterSpacing: "0.2em",
            }}
          >
            {ops.qrLabelTitle}
          </div>
          <div
            className="mt-2 font-bold uppercase tracking-wide text-slate-500 print:mt-[0.05cm]"
            style={{ fontSize: "clamp(5px, calc(var(--gloggt-work-resource-label-width, 10cm) * 0.03), 12px)" }}
          >
            {workResourceKindText(resource.kind, language)} · {resource.code}
          </div>
          <h1
            className="mt-2 font-black text-slate-950 print:mt-[0.05cm]"
            style={{ fontSize: "clamp(7px, calc(var(--gloggt-work-resource-label-width, 10cm) * 0.06), 24px)" }}
          >
            {resource.name}
          </h1>
          <img
            src={qrUrl}
            alt={ops.qrTitle}
            className="mx-auto mt-5 max-h-[70%] max-w-[90%] print:mt-[0.12cm]"
            style={{
              width: "var(--gloggt-work-resource-qr-size, 5cm)",
              height: "var(--gloggt-work-resource-qr-size, 5cm)",
            }}
          />
        </div>

        <div
          style={{ display: "var(--gloggt-work-resource-compact-row-display, none)" }}
          className="h-full w-full flex-row items-center justify-center gap-[0.05cm] leading-none"
        >
          <div
            className="shrink-0 whitespace-nowrap font-black uppercase text-slate-950"
            style={{
              fontSize: "clamp(5px, calc(var(--gloggt-work-resource-qr-size, 0.5cm) * 0.3), 10px)",
              letterSpacing: "0",
            }}
          >
            {resource.code}
          </div>
          <img
            src={qrUrl}
            alt={ops.qrTitle}
            className="shrink-0"
            style={{
              width: "var(--gloggt-work-resource-qr-size, 0.5cm)",
              height: "var(--gloggt-work-resource-qr-size, 0.5cm)",
            }}
          />
        </div>

        <div
          style={{ display: "var(--gloggt-work-resource-compact-column-display, none)" }}
          className="h-full w-full flex-col items-center justify-center gap-[0.05cm] leading-none"
        >
          <div
            className="shrink-0 whitespace-nowrap font-black uppercase text-slate-950"
            style={{
              fontSize: "clamp(6px, calc(var(--gloggt-work-resource-qr-size, 0.8cm) * 0.28), 11px)",
              letterSpacing: "0",
            }}
          >
            {resource.code}
          </div>
          <img
            src={qrUrl}
            alt={ops.qrTitle}
            className="shrink-0"
            style={{
              width: "var(--gloggt-work-resource-qr-size, 0.8cm)",
              height: "var(--gloggt-work-resource-qr-size, 0.8cm)",
            }}
          />
        </div>
      </section>
    </main>
  );
}
