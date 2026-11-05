import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { getCompanyAccess } from "@/lib/core/access-control";

// Return the file itself, never the GLÖGGT page layout inside an iframe.
// Every request independently checks login, company membership and receipt ownership.
// This is a read-only route; it neither changes receipt state nor saves reconciliation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const receiptId = Number(id);
  if (!Number.isSafeInteger(receiptId) || receiptId <= 0) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const cookieStore = await cookies();
  const companyId = Number(cookieStore.get("activeCompanyId")?.value);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const access = await getCompanyAccess(companyId);
  if (!access.allowed) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, companyId },
    select: { storagePath: true },
  });
  if (!receipt?.storagePath) {
    // Legacy local-only files remain available from their existing document page.
    // Never redirect to an unchecked filePath or arbitrary URL.
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const { data, error } = await supabaseAdmin.storage
    .from("fylgiskjol")
    .createSignedUrl(receipt.storagePath, 60 * 10);

  if (error || !data?.signedUrl) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const response = NextResponse.redirect(data.signedUrl, 302);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
