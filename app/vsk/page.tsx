import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { createVatPeriod } from "@/app/actions/vatActions";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import { getEffectiveUser } from "@/lib/core/access-control";

const formatKr = (amount: number) =>
  formatNumber(amount, {
    maximumFractionDigits: 0,
  });

export default async function VskPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    period?: string;
  }>;
}) {
  const cookieStore = await cookies();

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const params = await searchParams;

  const now = new Date();

  const defaultYear = now.getUTCFullYear();
  const defaultPeriod = Math.floor(now.getUTCMonth() / 2) + 1;

  const selectedYear = Number(
    params.year ?? String(defaultYear)
  );

  const selectedPeriod = Math.min(
    6,
    Math.max(
      1,
      Number(params.period ?? String(defaultPeriod))
    )
  );

  const startMonth = (selectedPeriod - 1) * 2;

  const periodStart = new Date(
    Date.UTC(selectedYear, startMonth, 1)
  );

  const periodEnd = new Date(
    Date.UTC(selectedYear, startMonth + 2, 1)
  );

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  if (activeUser.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: activeUser.id,
          companyId: activeCompanyId,
        },
      },
    });

    if (!access || !access.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const [company, accounts, receipts] = await Promise.all([
    prisma.company.findUnique({
      where: {
        id: activeCompanyId,
      },
      select: {
        name: true,
        kennitala: true,
        vatNumber: true,
      },
    }),

    prisma.account.findMany({
      where: {
        companyId: activeCompanyId,
        isActive: true,
      },
      select: {
        number: true,
        name: true,
        type: true,
      },
    }),

    prisma.receipt.findMany({
      where: {
        companyId: activeCompanyId,
        status: "APPROVED",
      },

      select: {
        id: true,
        voucherNumber: true,
        aiDate: true,
        date: true,
        description: true,

        entries: {
          select: {
            account: true,
            debit: true,
            credit: true,
          },
        },

        aiDetectedDocuments: {
          where: {
            approvedAt: {
              not: null,
            },
          },

          select: {
            id: true,
            date: true,
            voucherNumber: true,
            merchantName: true,
            summary: true,
            approvedAt: true,

            bookingEntries: {
              select: {
                account: true,
                debit: true,
                credit: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const vatPeriod = await prisma.vatPeriod.findUnique({
    where: {
      companyId_year_period: {
        companyId: activeCompanyId,
        year: selectedYear,
        period: selectedPeriod,
      },
    },
    include: {
      submissions: {
        orderBy: {
          version: "desc",
        },
      },
    },
  });

  const output = new Set(
    accounts
      .filter((a) => a.number === "2510")
      .map((a) => a.number)
  );

  const input = new Set(
    accounts
      .filter((a) => a.number === "2520")
      .map((a) => a.number)
  );

  let outputVat = 0;
  let inputVat = 0;

  const rows: {
    id: number;
    voucher: number | null;
    date: Date | null;
    text: string;
    output: number;
    input: number;
  }[] = [];

  let taxableSales24 = 0;

  for (const receipt of receipts) {
    const approvedDocuments = receipt.aiDetectedDocuments;

    for (const document of approvedDocuments) {
      const documentDate = document.date;

      if (!documentDate) continue;

      const isInSelectedPeriod =
        documentDate >= periodStart &&
        documentDate < periodEnd;

      if (!isInSelectedPeriod) continue;

      const isVatSettlement =
        document.bookingEntries.some(
          (entry) => entry.account === "2590"
        );

      if (isVatSettlement) continue;

      let rowOutput = 0;
      let rowInput = 0;

      for (const entry of document.bookingEntries) {
        if (entry.account === "3000") {
          taxableSales24 +=
            entry.credit - entry.debit;
        }

        if (output.has(entry.account)) {
          rowOutput +=
            entry.credit - entry.debit;
        }

        if (input.has(entry.account)) {
          rowInput +=
            entry.debit - entry.credit;
        }
      }

      outputVat += rowOutput;
      inputVat += rowInput;

      if (rowOutput || rowInput) {
        rows.push({
          id: document.id,
          voucher: document.voucherNumber,
          date: documentDate,
          text:
            document.merchantName ??
            document.summary,
          output: rowOutput,
          input: rowInput,
        });
      }
    }

    if (approvedDocuments.length > 0) continue;

    const receiptDate =
      receipt.aiDate ?? receipt.date;

    if (!receiptDate) continue;

    const isInSelectedPeriod =
      receiptDate >= periodStart &&
      receiptDate < periodEnd;

    if (!isInSelectedPeriod) continue;

    const isVatSettlement =
      receipt.entries.some(
        (entry) => entry.account === "2590"
      );

    if (isVatSettlement) continue;

    let rowOutput = 0;
    let rowInput = 0;

    for (const entry of receipt.entries) {
      if (entry.account === "3000") {
        taxableSales24 +=
          entry.credit - entry.debit;
      }

      if (output.has(entry.account)) {
        rowOutput +=
          entry.credit - entry.debit;
      }

      if (input.has(entry.account)) {
        rowInput +=
          entry.debit - entry.credit;
      }
    }

    outputVat += rowOutput;
    inputVat += rowInput;

    if (rowOutput || rowInput) {
      rows.push({
        id: receipt.id,
        voucher: receipt.voucherNumber,
        date: receiptDate,
        text: receipt.description,
        output: rowOutput,
        input: rowInput,
      });
    }
  }

  const balance = outputVat - inputVat;

  return (
    <main className="p-8">
      <PageHeader
        title="VSK og skil"
        description="Yfirlit byggt beint á bókuðum færslum. Smelltu niður í sundurliðun áður en skil eru staðfest."
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-semibold">Ár:</span>

        <a
          href={`/vsk?year=${selectedYear - 1}&period=${selectedPeriod}`}
          className="rounded-lg border bg-white px-3 py-2"
        >
          ← {selectedYear - 1}
        </a>

        <span className="rounded-lg border bg-slate-100 px-4 py-2 font-bold">
          {selectedYear}
        </span>

        <a
          href={`/vsk?year=${selectedYear + 1}&period=${selectedPeriod}`}
          className="rounded-lg border bg-white px-3 py-2"
        >
          {selectedYear + 1} →
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-semibold">
          VSK-tímabil:
        </span>

        <a
          href={`/vsk?year=${selectedYear}&period=1`}
          className={`rounded-lg border px-3 py-2 ${
            selectedPeriod === 1
              ? "bg-blue-600 text-white"
              : "bg-white"
          }`}
        >
          Jan–feb
        </a>

        <a
          href={`/vsk?year=${selectedYear}&period=2`}
          className={`rounded-lg border px-3 py-2 ${
            selectedPeriod === 2
              ? "bg-blue-600 text-white"
              : "bg-white"
          }`}
        >
          Mars–apríl
        </a>

        <a
          href={`/vsk?year=${selectedYear}&period=3`}
          className={`rounded-lg border px-3 py-2 ${
            selectedPeriod === 3
              ? "bg-blue-600 text-white"
              : "bg-white"
          }`}
        >
          Maí–júní
        </a>

        <a
          href={`/vsk?year=${selectedYear}&period=4`}
          className={`rounded-lg border px-3 py-2 ${
            selectedPeriod === 4
              ? "bg-blue-600 text-white"
              : "bg-white"
          }`}
        >
          Júlí–ágúst
        </a>

        <a
          href={`/vsk?year=${selectedYear}&period=5`}
          className={`rounded-lg border px-3 py-2 ${
            selectedPeriod === 5
              ? "bg-blue-600 text-white"
              : "bg-white"
          }`}
        >
          Sep–okt
        </a>

        <a
          href={`/vsk?year=${selectedYear}&period=6`}
          className={`rounded-lg border px-3 py-2 ${
            selectedPeriod === 6
              ? "bg-blue-600 text-white"
              : "bg-white"
          }`}
        >
          Nóv–des
        </a>
      </div>

      <div className="mt-4 rounded-lg border bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-500">
          Staða VSK-tímabils
        </p>

        <p className="mt-1 text-lg font-bold">
          {vatPeriod
            ? vatPeriod.status
            : "Ekki stofnað"}
        </p>

        <p className="mt-1 text-sm text-slate-500">
          {vatPeriod
            ? `${vatPeriod.submissions.length} skráðar sendingar / útgáfur`
            : "Tímabilið hefur ekki enn verið stofnað í VSK-uppgjörskerfinu."}
        </p>
      </div>

      {!vatPeriod && (
        <form
          action={async () => {
            "use server";

            await createVatPeriod(
              activeCompanyId,
              selectedYear,
              selectedPeriod
            );
          }}
          className="mt-3"
        >
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white"
          >
            Stofna VSK-tímabil
          </button>
        </form>
      )}

      <section className="mt-6 max-w-6xl rounded-xl border bg-white shadow-sm">
        <div className="border-b p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Virkt fyrirtæki
              </p>

              <h2 className="mt-1 text-2xl font-bold">
                {company.name}
              </h2>

              <p className="mt-1 text-slate-600">
                Kt. {company.kennitala} · VSK-nr.{" "}
                {company.vatNumber || "ekki skráð"}
              </p>
            </div>

            <div
              className={`rounded-lg px-4 py-3 font-semibold ${
                company.vatNumber
                  ? "bg-green-50 text-green-800"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {company.vatNumber
                ? "VSK-númer skráð"
                : "⚠ VSK-númer vantar í stofnupplýsingar"}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-sm font-semibold text-slate-500">
              A – Skattskyld velta 24%
            </p>

            <p className="mt-1 text-2xl font-bold">
              {formatKr(taxableSales24)} kr.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-sm font-semibold text-slate-500">
              B – Skattskyld velta 11%
            </p>

            <p className="mt-1 text-2xl font-bold">
              0 kr.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-sm font-semibold text-slate-500">
              C – Undanþegin velta
            </p>

            <p className="mt-1 text-2xl font-bold">
              0 kr.
            </p>
          </div>
        </div>

        <div className="grid gap-0 border-b md:grid-cols-3">
          <div className="p-6 md:border-r">
            <p className="text-slate-500">
              D – Útskattur
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatKr(outputVat)} kr.
            </p>
          </div>

          <div className="p-6 md:border-r">
            <p className="text-slate-500">
              E – Innskattur
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatKr(inputVat)} kr.
            </p>
          </div>

          <div className="p-6">
            <p className="text-slate-500">
              F – Álagning
            </p>

            <p className="mt-2 text-3xl font-bold">
              {formatKr(balance)} kr.
            </p>
          </div>

          <div className="p-6">
            <p className="text-slate-500">
              G – Álag
            </p>

            <p className="mt-2 text-3xl font-bold">
              0 kr.
            </p>
          </div>

          <div className="p-6">
            <p className="text-slate-500">
              H – Til greiðslu / inneign
            </p>

            <p
              className={`mt-2 text-3xl font-bold ${
                balance > 0
                  ? "text-red-700"
                  : "text-green-700"
              }`}
            >
              {formatKr(Math.abs(balance))} kr.
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {balance > 0
                ? "Til greiðslu"
                : balance < 0
                  ? "Inneign"
                  : "Stendur á núlli"}
            </p>
          </div>
        </div>

        <details open className="p-6">
          <summary className="cursor-pointer text-xl font-bold">
            Sundurliðun bókaðra VSK-færslna ({rows.length})
          </summary>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="p-3">
                    Dags.
                  </th>

                  <th className="p-3">
                    Fylgiskjal
                  </th>

                  <th className="p-3">
                    Lýsing
                  </th>

                  <th className="p-3 text-right">
                    Útskattur
                  </th>

                  <th className="p-3 text-right">
                    Innskattur
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b"
                  >
                    <td className="p-3">
                      {row.date
                        ? formatDate(row.date)
                        : "—"}
                    </td>

                    <td className="p-3">
                      {row.voucher ?? "—"}
                    </td>

                    <td className="p-3">
                      {row.text}
                    </td>

                    <td className="p-3 text-right">
                      {row.output
                        ? `${formatKr(row.output)} kr.`
                        : "—"}
                    </td>

                    <td className="p-3 text-right">
                      {row.input
                        ? `${formatKr(row.input)} kr.`
                        : "—"}
                    </td>
                  </tr>
                ))}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-slate-500"
                    >
                      Engar bókaðar VSK-færslur fundust enn.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </main>
  );
}