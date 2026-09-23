import "server-only";

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type HomeDocumentSummary = {
  uploaded: number;
  pending: number;
  booked: number;
};

type HomeDocumentSummaryRow = {
  companyId: number;
  uploaded: bigint;
  pending: bigint;
  booked: bigint;
};

export const EMPTY_HOME_DOCUMENT_SUMMARY: HomeDocumentSummary = {
  uploaded: 0,
  pending: 0,
  booked: 0,
};

/**
 * Reiknar Home-samantekt beint í Postgres í stað þess að sækja öll Receipt
 * og AiDetectedDocument gögn inn í server-renderið.
 *
 * Reglurnar eru vísvitandi þær sömu og eldri Home-síðan notaði:
 * - Receipt með detected documents telur skjölin sjálf.
 * - Receipt án detected documents telur sem eitt skjal.
 * - Pending/booked fallback fyrir eldri Receipt án detected documents helst.
 */
export async function getHomeDocumentSummaries(companyIds: number[]) {
  const ids = Array.from(
    new Set(
      companyIds.filter(
        (companyId) => Number.isInteger(companyId) && companyId > 0,
      ),
    ),
  );

  if (ids.length === 0) {
    return new Map<number, HomeDocumentSummary>();
  }

  const rows = await prisma.$queryRaw<HomeDocumentSummaryRow[]>(Prisma.sql`
    WITH receipt_document_stats AS (
      SELECT
        r.id,
        r."companyId" AS "companyId",
        r.status,
        r."voucherNumber" AS "voucherNumber",
        COUNT(d.id)::bigint AS "documentCount",
        COUNT(d.id) FILTER (WHERE d."approvedAt" IS NULL)::bigint AS "pendingDocumentCount",
        COUNT(d.id) FILTER (
          WHERE d."approvedAt" IS NOT NULL
            AND d."voucherNumber" IS NOT NULL
        )::bigint AS "bookedDocumentCount"
      FROM "Receipt" r
      LEFT JOIN "AiDetectedDocument" d
        ON d."receiptId" = r.id
      WHERE r."companyId" IN (${Prisma.join(ids)})
      GROUP BY r.id
    )
    SELECT
      "companyId",
      COALESCE(
        SUM(
          CASE
            WHEN "documentCount" > 0 THEN "documentCount"
            ELSE 1
          END
        ),
        0
      )::bigint AS uploaded,
      COALESCE(
        SUM(
          CASE
            WHEN "documentCount" > 0 THEN "pendingDocumentCount"
            WHEN status = 'APPROVED' THEN 0
            ELSE 1
          END
        ),
        0
      )::bigint AS pending,
      COALESCE(
        SUM(
          CASE
            WHEN "documentCount" > 0 THEN "bookedDocumentCount"
            WHEN "voucherNumber" IS NOT NULL THEN 1
            ELSE 0
          END
        ),
        0
      )::bigint AS booked
    FROM receipt_document_stats
    GROUP BY "companyId"
  `);

  return new Map(
    rows.map((row) => [
      row.companyId,
      {
        uploaded: Number(row.uploaded),
        pending: Number(row.pending),
        booked: Number(row.booked),
      },
    ]),
  );
}
