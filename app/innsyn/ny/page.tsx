import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEffectiveUser } from "@/lib/core/access-control";
import { prisma } from "@/lib/prisma";
import { InsightMixedOverview } from "../_components/InsightMixedOverview";
import { buildInsightPeriod } from "../_lib/period";
import { loadInsightSummary } from "../_lib/load-summary";
import type { InsightPeriodPreset } from "../_lib/presentation-model";
import type { InsightDrilldownSelection } from "../_lib/drilldown";

const allowedPresets = new Set<InsightPeriodPreset>([
  "LAST_12_MONTHS",
  "THIS_YEAR",
  "THIS_QUARTER",
  "THIS_MONTH",
]);

function parsePreset(value: string | string[] | undefined): InsightPeriodPreset {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && allowedPresets.has(candidate as InsightPeriodPreset)
    ? (candidate as InsightPeriodPreset)
    : "LAST_12_MONTHS";
}


function parseUnitPriceFocus(
  value: string | string[] | undefined,
): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  const trimmed = candidate?.trim();
  return trimmed ? trimmed : null;
}

function parseDrilldown(
  params: Record<string, string | string[] | undefined>,
): InsightDrilldownSelection | null {
  const focusValue = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const idValue = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!idValue?.trim()) return null;
  if (focusValue === "account") return { type: "account", id: idValue.trim() };
  if (focusValue === "merchant") return { type: "merchant", id: idValue.trim() };
  return null;
}

export default async function NewInsightPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);
  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  if (activeUser.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: activeUser.id,
          companyId,
        },
      },
      select: { isActive: true },
    });

    if (!access?.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const [params, userSettings] = await Promise.all([
    searchParams ??
      Promise.resolve<Record<string, string | string[] | undefined>>({}),
    prisma.userSettings.findUnique({
      where: { userId: activeUser.id },
      select: { interfaceLanguage: true },
    }),
  ]);

  const preset = parsePreset(params.period);
  const period = buildInsightPeriod(preset);
  const drilldownSelection = parseDrilldown(params);
  const selectedUnitPriceId = parseUnitPriceFocus(params.unit);
  const summary = await loadInsightSummary(companyId, period, drilldownSelection);

  return (
    <InsightMixedOverview
      summary={summary}
      language={userSettings?.interfaceLanguage ?? "is"}
      selectedUnitPriceId={selectedUnitPriceId}
    />
  );
}
