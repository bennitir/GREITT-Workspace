import { NextResponse } from "next/server";

import { getEffectiveUser } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";

function clean(value: unknown, max = 4096) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const user = await getEffectiveUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null) as null | {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    soundEnabled?: unknown;
  };

  const endpoint = clean(body?.endpoint, 8192);
  const p256dh = clean(body?.keys?.p256dh, 512);
  const auth = clean(body?.keys?.auth, 256);
  const soundEnabled = typeof body?.soundEnabled === "boolean" ? body.soundEnabled : null;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "INVALID_SUBSCRIPTION" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_ENDPOINT" }, { status: 400 });
  }
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ ok: false, error: "INVALID_ENDPOINT" }, { status: 400 });
  }

  const saved = await prisma.userPushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      soundEnabled: soundEnabled ?? true,
      userAgent: request.headers.get("user-agent")?.slice(0, 1000) || null,
    },
    update: {
      userId: user.id,
      p256dh,
      auth,
      ...(soundEnabled === null ? {} : { soundEnabled }),
      userAgent: request.headers.get("user-agent")?.slice(0, 1000) || null,
      disabledAt: null,
      failureCount: 0,
    },
  });

  return NextResponse.json({ ok: true, soundEnabled: saved.soundEnabled });
}

export async function DELETE(request: Request) {
  const user = await getEffectiveUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => null) as null | { endpoint?: unknown };
  const endpoint = clean(body?.endpoint, 8192);
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 400 });

  await prisma.userPushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
