import { formatDate } from "@/lib/locale";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";
import DeleteCompanyButton from "@/components/DeleteCompanyButton";
import {
  initializeCompanyAccounts,
  addMissingDefaultAccounts,
  setReceiptEntryMode,
} from "@/app/actions/companyActions";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FyrirtaekiDetailPage({
  params,
}: Props) {
  const { id } = await params;
  const companyId = Number(id);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  if (activeUser.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: activeUser.id,
          companyId,
        },
      },
    });

    if (!access || !access.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    include: {
      accounts: {
        orderBy: {
          number: "asc",
        },
      },
      _count: {
        select: {
          receipts: true,
        },
      },
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">
        {company.name}
      </h1>

      {!company.isActive && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-800">
          <strong>LESHAMUR</strong> — fyrirtækið er lokað.
          Gögn og fylgiskjöl eru varðveitt, en ekki er hægt að breyta
          eða bóka nýjar færslur.
        </div>
      )}

      <div className="mt-6 space-y-3 rounded-lg border bg-white p-6 shadow-sm">
        <p>
          <strong>Kennitala:</strong>{" "}
          {company.kennitala}
        </p>

        <p>
          <strong>VSK-númer:</strong>{" "}
          {company.vatNumber || "Ekki skráð"}
        </p>

        <p>
          <strong>Heimilisfang:</strong>{" "}
          {company.address}
        </p>

        <p>
          <strong>Sími:</strong>{" "}
          {company.phone}
        </p>

        <p>
          <strong>Netfang:</strong>{" "}
          {company.email}
        </p>

        <p>
          <strong>Tengiliður:</strong>{" "}
          {company.contact}
        </p>

        <div className="mt-8 rounded-lg border p-4">
          <h2 className="mb-3 text-xl font-semibold">
            Bókhald
          </h2>

          <p>
            <strong>Næsta fylgiskjalsnúmer:</strong>{" "}
            {company.nextVoucherNumber}
          </p>

          <p className="mt-2">
            <strong>Reikningslykill:</strong>{" "}
            {company.accounts.length > 0
              ? `${company.accounts.length} reikningar skráðir`
              : "Ekki settur upp"}
          </p>

          <div className="mt-4">
            <p className="font-semibold">
              Skráning fylgiskjala
            </p>

            {company.isActive && (
              <div className="mt-2 flex gap-2">
                <form
                  action={async () => {
                    "use server";

                    await setReceiptEntryMode(
                      company.id,
                      "AI"
                    );
                  }}
                >
                  <button
                    type="submit"
                    className={`rounded px-3 py-2 ${
                      company.receiptEntryMode === "AI"
                        ? "bg-blue-600 text-white"
                        : "border bg-white"
                    }`}
                  >
                    Sjálfvirk með AI
                  </button>
                </form>

                <form
                  action={async () => {
                    "use server";

                    await setReceiptEntryMode(
                      company.id,
                      "MANUAL"
                    );

                    redirect("/fylgiskjol/handvirkt");
                  }}
                >
                  <button
                    type="submit"
                    className={`rounded px-3 py-2 ${
                      company.receiptEntryMode === "MANUAL"
                        ? "bg-blue-600 text-white"
                        : "border bg-white"
                    }`}
                  >
                    Handvirk skráning
                  </button>
                </form>
              </div>
            )}
          </div>

          {company.accounts.length === 0 ? (
            <form
              action={async () => {
                "use server";

                await initializeCompanyAccounts(
                  company.id
                );
              }}
              className="mt-4"
            >
              <button
                type="submit"
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
              >
                Setja upp GLÖGGT reikningslykil
              </button>
            </form>
          ) : activeUser.role === "ADMIN" ? (
            <div className="mt-4 space-y-3">
              <div className="rounded border border-green-300 bg-green-50 p-3 text-green-700">
                ✓ GLÖGGT reikningslykill uppsettur
              </div>

              <form
                action={async () => {
                  "use server";

                  await addMissingDefaultAccounts(
                    company.id
                  );
                }}
              >
                <button
                  type="submit"
                  className="rounded border border-blue-300 bg-blue-50 px-4 py-2 font-medium text-blue-800 hover:bg-blue-100"
                >
                  Bæta við nýjum GLÖGGT grunnlyklum
                </button>

                <p className="mt-1 text-sm text-slate-500">
                  Bætir aðeins við lyklum sem vantar.
                  Eigin lyklar fyrirtækisins eru ekki yfirskrifaðir.
                </p>
              </form>
            </div>
          ) : null}
        </div>

        <div className="mt-8 rounded-lg border p-4">
          <h2 className="mb-3 text-xl font-semibold">
            RSK og virk starfsemi
          </h2>

          <p>
            <strong>Skráð hjá RSK:</strong>{" "}
            {company.rskRegisteredActivities ??
              "Ekki skráð"}
          </p>

          <p className="mt-2">
            <strong>Virk starfsemi:</strong>{" "}
            {company.activeActivities ??
              "Ekki staðfest"}
          </p>

          <p className="mt-2">
            <strong>
              RSK gögn síðast uppfærð:
            </strong>{" "}
            {company.rskDataUpdatedAt
              ? formatDate(
                  company.rskDataUpdatedAt
                )
              : "Óþekkt"}
          </p>

          <p className="mt-2">
            <strong>
              Virk starfsemi staðfest:
            </strong>{" "}
            {company.activitiesConfirmedAt
              ? formatDate(
                  company.activitiesConfirmedAt
                )
              : "Ekki staðfest"}
          </p>

          <p className="mt-2">
            <strong>Staðfest af:</strong>{" "}
            {company.activitiesConfirmedBy ||
              "Ekki skráð"}
          </p>

          <p className="mt-2">
            <strong>Staðfest vottorð:</strong>{" "}
            {company.rskCertificatePath ? (
              <a
                href={company.rskCertificatePath}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Opna vottorð
              </a>
            ) : (
              "Ekkert vottorð"
            )}
          </p>
        </div>

        {activeUser.role === "ADMIN" &&
          company.isActive && (
            <div className="flex gap-3 pt-4">
              <Link
                href={`/fyrirtaeki/${id}/breyta`}
                className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Breyta fyrirtæki
              </Link>

              <DeleteCompanyButton
                id={company.id}
                hasBookkeepingData={
                  company._count.receipts > 0 ||
                  company.nextVoucherNumber > 1
                }
              />
            </div>
          )}
      </div>
    </main>
  );
}