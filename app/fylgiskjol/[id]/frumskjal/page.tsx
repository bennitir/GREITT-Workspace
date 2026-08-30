import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { getCompanyAccess } from "@/lib/core/access-control";

export default async function FrumskjalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  const access = await getCompanyAccess(companyId);

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

  return (
    <main className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Frumskjal
            </h1>

            <p className="mt-1 text-sm text-gray-600">
              {receipt.company.name} · Fylgiskjal #{receipt.id}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/fylgiskjol/${receipt.id}`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-gray-800 hover:bg-gray-50"
            >
              ← Til baka
            </Link>

            <a
              href={originalFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 font-semibold text-blue-700 hover:bg-blue-50"
            >
              Opna eitt og sér
            </a>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          {isPdf ? (
            <iframe
              src={originalFileUrl}
              title="Frumskjal"
              className="h-[calc(100vh-180px)] min-h-[700px] w-full"
            />
          ) : (
            <div className="flex min-h-[700px] items-start justify-center overflow-auto bg-neutral-900 p-4 md:p-8">
              <img
                src={originalFileUrl}
                alt="Frumskjal"
                className="h-auto max-w-full rounded shadow-lg"
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
