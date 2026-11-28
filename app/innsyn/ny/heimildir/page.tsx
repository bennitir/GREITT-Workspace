import "server-only";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveCompanyReadAccess } from "@/lib/core/company-read-access";
import { prisma } from "@/lib/prisma";
import { EVIDENCE_LABELS, integerKrFromBank } from "@/lib/personal-finance/person-history-review";
import { vehiclePlateQueryTerms } from "@/lib/vehicle/loan-document-evidence";
import { buildVehicleEvidenceReview } from "@/lib/insyn/vehicle-evidence-review";

export const dynamic = "force-dynamic";
const LIMIT = 100;

function selectedId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function excerpt(value: string, max = 350): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}
function day(value: Date): string {
  return new Intl.DateTimeFormat("is-IS", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(value);
}

export default async function VehicleEvidencePage({searchParams}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const {companyId, access} = await requireActiveCompanyReadAccess();
  if (access.role !== "OWNER" && access.role !== "ADMIN") notFound();
  const params = await (searchParams ?? Promise.resolve<Record<string, string | string[] | undefined>>({}));
  const requestedId = selectedId(params.vehicle);
  const vehicleRows = await prisma.workResource.findMany({
    where: {companyId, kind: "VEHICLE", isActive: true},
    select: {id: true, name: true, code: true},
    orderBy: [{name: "asc"}, {id: "asc"}], take: 201,
  });
  const vehiclesOverflow = vehicleRows.length > 200;
  const vehicles = vehicleRows.slice(0, 200);
  const vehicle = vehicles.find(v => v.id === requestedId) ?? null;
  const terms = vehicle ? vehiclePlateQueryTerms(vehicle.code) : [];
  // No implicit vehicle selection. Every source query is strictly company-scoped.
  const [sourceDocs, sourceBanks, sourceLoans] = vehicle && terms.length
    ? await Promise.all([
        prisma.aiDetectedDocument.findMany({
          where: {receipt: {companyId}, OR: terms.map(term => ({
            summary: {contains: term, mode: "insensitive" as const},
          }))},
          select: {id: true, receiptId: true, summary: true},
          orderBy: {id: "desc"}, take: LIMIT + 1,
        }),
        prisma.bankTransaction.findMany({
          where: {bankAccount: {is: {companyId}}, OR: terms.flatMap(term => [
            {text: {contains: term, mode: "insensitive" as const}},
            {reference: {contains: term, mode: "insensitive" as const}},
          ])},
          select: {id: true, date: true, amount: true, text: true,
            reference: true, status: true, bankAccount: {select: {id: true, name: true}}},
          orderBy: [{date: "desc"}, {id: "desc"}], take: LIMIT + 1,
        }),
        prisma.insightEntity.findMany({
          where: {companyId, status: "ACTIVE", entityType: {in: ["LOAN", "DEBT_INSTRUMENT"]}},
          select: {id: true, name: true, identifierValue: true},
          orderBy: {id: "asc"}, take: LIMIT + 1,
        }),
      ])
    : [[], [], []];
  const docsOverflow = sourceDocs.length > LIMIT;
  const bankOverflow = sourceBanks.length > LIMIT;
  const loansOverflow = sourceLoans.length > LIMIT;
  const review = buildVehicleEvidenceReview(
    vehicle?.code ?? "", sourceDocs.slice(0, LIMIT),
    sourceBanks.slice(0, LIMIT).map(row => ({
      id: row.id, bankAccountId: row.bankAccount.id, date: row.date,
      amountRaw: row.amount.toString(), text: row.text, reference: row.reference,
      status: row.status, bankAccountName: row.bankAccount.name,
    })),
    loansOverflow ? [] : sourceLoans,
  );

  return <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
    <nav className="text-sm"><Link href="/innsyn/ny" className="font-semibold text-blue-800 underline">
      {"\u2190 Aftur \u00ed Inns\u00fdn"}
    </Link></nav>
    <header className="rounded-xl border bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
        {"GL\u00d6GGT \u00b7 Inns\u00fdn \u00b7 eing\u00f6ngu lestur"}
      </p>
      <h1 className="mt-2 text-2xl font-bold">{"Heimildaleit \u00f6kut\u00e6kja"}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {"H\u00e9r eru a\u00f0eins v\u00edsbendingar \u00far bankatexta og greindum skj\u00f6lum. "}
        {"Samsv\u00f6run sannar ekki eiganda, skuld, tengsl vi\u00f0 l\u00e1n n\u00e9 grei\u00f0slu."}
      </p>
    </header>
    <section className="rounded-xl border bg-white p-5">
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label htmlFor="vehicle" className="flex min-w-64 flex-col gap-2 text-sm font-semibold">
          {"Veldu \u00f6kut\u00e6ki fyrirt\u00e6kisins"}
          <select id="vehicle" name="vehicle" defaultValue={vehicle?.id ?? ""}
            className="rounded-lg border bg-white px-3 py-2">
            <option value="">{"Veldu \u00f6kut\u00e6ki"}</option>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          {"S\u00fdna heimildir"}
        </button>
      </form>
      {vehiclesOverflow && <p role="alert" className="mt-2 text-sm text-amber-800">
        {"A\u00f0eins fyrstu 200 \u00f6kut\u00e6kin eru s\u00fdnd. Listinn er ekki t\u00e6mandi."}
      </p>}
      {vehicle && terms.length === 0 && <p role="alert" className="mt-2 text-sm text-amber-800">
        {"\u00d3gilt skr\u00e1ningarn\u00famer: engin gagnaleit var ger\u00f0."}
      </p>}
    </section>
    {vehicle && terms.length > 0 && <>
      <aside className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
        {"Engin sj\u00e1lfvirk tenging, sta\u00f0festing e\u00f0a b\u00f3kun fer fram. "}
        {"Far\u00f0u \u00ed frumskjal til a\u00f0 yfirfara hverja v\u00edsbendingu."}
        {(docsOverflow || bankOverflow || loansOverflow) && <p className="mt-2 font-semibold">
          {"Lesm\u00f6rkum var n\u00e1\u00f0: leitin er ekki t\u00e6mandi."}
          {loansOverflow && " L\u00e1nasamsv\u00f6run er ekki birt vegna fj\u00f6lda l\u00e1na."}
        </p>}
      </aside>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-xl font-bold">{"Fylgiskj\u00f6l me\u00f0 b\u00edln\u00fameri"} ({review.documents.length})</h2>
        <div className="mt-3 space-y-3">
          {!review.documents.length && <p className="text-sm">{"Engar n\u00e1kv\u00e6mar samsvaranir \u00ed sko\u00f0u\u00f0u \u00fartaki."}</p>}
          {review.documents.map(doc => <article key={doc.id} className="rounded-lg border bg-slate-50 p-4">
            <strong className="text-sm">{"Greint skjal"} #{doc.id}</strong>
            <p className="mt-2 text-sm">{excerpt(doc.summary)}</p>
            <p className="mt-2 text-xs text-slate-600">{doc.kinds.map(k => EVIDENCE_LABELS[k]).join(" \u00b7 ")}</p>
            {doc.loanLeads.length > 0 && <div className="mt-2 rounded border border-amber-300 p-3 text-sm">
              <strong>{"M\u00f6guleg l\u00e1nsn\u00famer \u00ed sama skjali (\u00f3sta\u00f0fest)"}</strong>
              {doc.loanLeads.map(loan => <p key={loan.id} className="mt-1">
                {loan.name} ({loan.identifierValue})
                {loan.ambiguous ? " \u00b7 Margar tilv\u00edsanir \u00ed skjalinu" : ""}
              </p>)}
            </div>}
            <Link href={`/fylgiskjol/${doc.receiptId}`}
              className="mt-3 inline-block text-sm font-semibold text-blue-800 underline">
              {"Opna frumskjal"} #{doc.receiptId}
            </Link>
          </article>)}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="text-xl font-bold">{"Bankal\u00ednur me\u00f0 b\u00edln\u00fameri"} ({review.bankLines.length})</h2>
        <div className="mt-3 space-y-3">
          {!review.bankLines.length && <p className="text-sm">{"Engar n\u00e1kv\u00e6mar samsvaranir \u00ed sko\u00f0u\u00f0u \u00fartaki."}</p>}
          {review.bankLines.map(row => <article key={row.id} className="rounded-lg border bg-slate-50 p-4">
            <p className="text-sm font-semibold">{day(row.date)} {"\u00b7"} {row.bankAccountName}</p>
            <p className="mt-1 text-sm">{excerpt(`${row.text ?? ""} ${row.reference ?? ""}`, 240)}</p>
            <p className="mt-1 text-sm font-semibold">{integerKrFromBank(row.amountRaw)}</p>
            <p className="mt-2 text-xs text-slate-600">
              {row.kinds.map(k => EVIDENCE_LABELS[k]).join(" \u00b7 ")}
              {" \u00b7 Bankasta\u00f0a: "}{row.status}
            </p>
            <Link href={`/banki/${row.bankAccountId}/afstemming`}
              className="mt-2 inline-block text-sm font-semibold text-blue-800 underline">
              {"Opna afstemmingu bankareiknings"}
            </Link>
          </article>)}
        </div>
      </section>
    </>}
  </main>;
}
