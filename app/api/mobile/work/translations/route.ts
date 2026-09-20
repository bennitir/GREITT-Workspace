import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getMobileWorkActor } from "@/lib/work10/mobile-access";
import {
  activeAssignedWorkOrderIdsForUser,
  ensureWork10OperationalTranslationsForWorkOrders,
} from "@/lib/work10/translation-sync";

export async function POST(request: Request) {
  try {
    const actor = await getMobileWorkActor();
    const body = (await request.json().catch(() => null)) as
      | { workOrderId?: unknown }
      | null;
    const requestedWorkOrderId = Number(body?.workOrderId);

    let workOrderIds: number[];
    if (Number.isInteger(requestedWorkOrderId) && requestedWorkOrderId > 0) {
      const work = await prisma.workOrder.findFirst({
        where: {
          id: requestedWorkOrderId,
          companyId: actor.companyId,
        },
        select: { id: true },
      });
      workOrderIds = work ? [work.id] : [];
    } else {
      workOrderIds = await activeAssignedWorkOrderIdsForUser({
        companyId: actor.companyId,
        userId: actor.user.id,
        limit: 30,
      });
    }

    if (workOrderIds.length === 0) {
      return NextResponse.json({ ok: true, translatedCount: 0 });
    }

    const result = await ensureWork10OperationalTranslationsForWorkOrders({
      companyId: actor.companyId,
      userId: actor.user.id,
      workOrderIds,
      targetLanguages: [actor.language],
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Mobile operational translation sync failed", error);
    return NextResponse.json(
      { ok: false, translatedCount: 0 },
      { status: 500 },
    );
  }
}
