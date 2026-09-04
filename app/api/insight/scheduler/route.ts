import { NextRequest, NextResponse } from "next/server";
import { runInsightWorker } from "@/lib/insight/worker";

export const maxDuration = 300;

function isAuthorized(request: NextRequest) {
  const expectedSecret = process.env.INSIGHT_WORKER_SECRET;

  if (!expectedSecret) {
    throw new Error("INSIGHT_WORKER_SECRET vantar.");
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const providedSecret = authHeader.slice("Bearer ".length).trim();

  return providedSecret === expectedSecret;
}

async function handleSchedulerRequest(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Óheimil beiðni.",
        },
        {
          status: 401,
        }
      );
    }

    const result = await runInsightWorker({
      maxItems: 1,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("Innsýn scheduler route villa:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Óþekkt villa í Innsýn scheduler.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleSchedulerRequest(request);
}

export async function GET(request: NextRequest) {
  return handleSchedulerRequest(request);
}