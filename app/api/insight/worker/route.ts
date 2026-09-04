import { NextRequest, NextResponse } from "next/server";
import { runInsightWorker } from "@/lib/insight/worker";

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

async function handleWorkerRequest(request: NextRequest) {
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

    const url = new URL(request.url);

    const jobIdRaw = url.searchParams.get("jobId");
    const maxItemsRaw = url.searchParams.get("maxItems");

    let jobId: number | undefined;
    let maxItems = 1;

    if (jobIdRaw !== null) {
      const parsedJobId = Number(jobIdRaw);

      if (!Number.isInteger(parsedJobId) || parsedJobId <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Ógilt jobId.",
          },
          {
            status: 400,
          }
        );
      }

      jobId = parsedJobId;
    }

    if (maxItemsRaw !== null) {
      const parsedMaxItems = Number(maxItemsRaw);

      if (
        !Number.isInteger(parsedMaxItems) ||
        parsedMaxItems <= 0 ||
        parsedMaxItems > 20
      ) {
        return NextResponse.json(
          {
            ok: false,
            error: "maxItems verður að vera heiltala á bilinu 1–20.",
          },
          {
            status: 400,
          }
        );
      }

      maxItems = parsedMaxItems;
    }

    const result = await runInsightWorker({
      jobId,
      maxItems,
    });

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("Innsýn worker route villa:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Óþekkt villa í Innsýn worker.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(request: NextRequest) {
  return handleWorkerRequest(request);
}

export async function GET(request: NextRequest) {
  return handleWorkerRequest(request);
}