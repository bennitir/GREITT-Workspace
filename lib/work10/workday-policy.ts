export type WorkplaceBreakRuleInput = {
  code: string;
  label: string;
  targetStartMinutes: number;
  durationMinutes: number;
  flexibleBeforeMinutes?: number | null;
  flexibleAfterMinutes?: number | null;
  allowFinishNearCompleteWork?: boolean | null;
  finishNearCompleteThresholdMinutes?: number | null;
};

export type LaborAgreementBreakRuleInput = {
  breakCode: string;
  minimumShiftMinutes?: number | null;
  entitlementMinutes?: number | null;
  paidBreak?: boolean | null;
  missedBreakTreatment?: string | null;
};

export type ResolvedWorkdayBreak = {
  code: string;
  label: string;
  targetStartMinutes: number;
  earliestStartMinutes: number;
  latestStartMinutes: number;
  durationMinutes: number;
  allowFinishNearCompleteWork: boolean;
  finishNearCompleteThresholdMinutes: number;
  paidBreak: boolean | null;
  missedBreakTreatment: string;
};

export type ProjectedBreak = {
  code: string;
  label: string;
  startMinutes: number;
  durationMinutes: number;
  mode: "INTERRUPT_WORK" | "AFTER_WORK";
};

export type ProjectedWorkWindow = {
  startMinutes: number;
  endMinutes: number;
  workMinutes: number;
  elapsedMinutes: number;
  breaks: ProjectedBreak[];
};

function finiteMinute(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : fallback;
}

/**
 * Sameinar rekstrarlega vinnustaðarreglu og staðfest/óstaðfest ákvæði
 * kjarasamningsprófíls. Vinnustaðurinn segir hvenær hlé er venjulega tekið;
 * kjarasamningur getur breytt réttindalengd og skilyrðum en launaleg túlkun
 * er aðeins varðveitt sem kóði þar til hún hefur verið staðfest sérstaklega.
 */
export function resolveWorkdayBreaks(args: {
  workplaceBreaks: WorkplaceBreakRuleInput[];
  agreementBreaks?: LaborAgreementBreakRuleInput[];
  plannedShiftMinutes: number;
}): ResolvedWorkdayBreak[] {
  const agreementByCode = new Map(
    (args.agreementBreaks ?? []).map((rule) => [rule.breakCode.trim().toUpperCase(), rule]),
  );

  return args.workplaceBreaks
    .slice()
    .sort((a, b) => a.targetStartMinutes - b.targetStartMinutes || a.code.localeCompare(b.code))
    .flatMap((rule) => {
      const code = rule.code.trim().toUpperCase();
      const agreement = agreementByCode.get(code);
      const minimumShiftMinutes = finiteMinute(agreement?.minimumShiftMinutes, 0);
      if (args.plannedShiftMinutes < minimumShiftMinutes) return [];

      const target = finiteMinute(rule.targetStartMinutes, 0);
      const before = finiteMinute(rule.flexibleBeforeMinutes, 0);
      const after = finiteMinute(rule.flexibleAfterMinutes, 0);
      const workplaceDuration = Math.max(1, finiteMinute(rule.durationMinutes, 1));
      const entitlement = agreement?.entitlementMinutes;
      const duration = Number.isFinite(entitlement)
        ? Math.max(1, Math.round(entitlement as number))
        : workplaceDuration;

      return [{
        code,
        label: rule.label,
        targetStartMinutes: target,
        earliestStartMinutes: Math.max(0, target - before),
        latestStartMinutes: Math.min(24 * 60 - 1, target + after),
        durationMinutes: duration,
        allowFinishNearCompleteWork: rule.allowFinishNearCompleteWork !== false,
        finishNearCompleteThresholdMinutes: finiteMinute(rule.finishNearCompleteThresholdMinutes, 15),
        paidBreak: agreement?.paidBreak ?? null,
        missedBreakTreatment: agreement?.missedBreakTreatment?.trim().toUpperCase() || "REVIEW",
      }];
    });
}

/**
 * Reiknar raunhæfan lokatíma Verks þegar neysluhlé geta lent inni í því.
 * Reglan er vísvitandi rekstrarleg: ef aðeins lítið er eftir má klára Verkið
 * og taka hlé strax á eftir. Hún ákveður EKKI hvernig ótekið/frestað hlé er
 * greitt; það á heima í staðfestu kjarasamnings-/launalagi.
 */
export function projectWorkWindowWithBreaks(args: {
  startMinutes: number;
  workMinutes: number;
  breaks: ResolvedWorkdayBreak[];
  alreadyTakenBreakCodes?: Iterable<string>;
}): ProjectedWorkWindow {
  const start = Math.max(0, Math.round(args.startMinutes));
  let cursor = start;
  let remaining = Math.max(0, Math.round(args.workMinutes));
  const taken = new Set(
    [...(args.alreadyTakenBreakCodes ?? [])].map((code) => code.trim().toUpperCase()),
  );
  const projected: ProjectedBreak[] = [];

  for (const rule of args.breaks) {
    if (remaining <= 0) break;
    if (taken.has(rule.code)) continue;

    // Ef Verkið myndi klárast áður en hléglugginn byrjar hefur þetta hlé
    // ekki áhrif á þetta Verk.
    if (cursor + remaining <= rule.earliestStartMinutes) continue;

    // Ef hléið er þegar orðið tímabært þegar Verkið hefst/tæmist úr fyrra
    // Verki, tökum það við fyrsta raunhæfa tækifæri nema stutt sé eftir.
    const desiredBreakStart = Math.max(cursor, rule.targetStartMinutes);
    const workUntilDesiredBreak = Math.max(0, desiredBreakStart - cursor);

    if (remaining <= workUntilDesiredBreak) {
      cursor += remaining;
      remaining = 0;
      break;
    }

    remaining -= workUntilDesiredBreak;
    cursor += workUntilDesiredBreak;

    const finishBeforeLatest = cursor + remaining <= rule.latestStartMinutes;
    const nearComplete =
      rule.allowFinishNearCompleteWork &&
      remaining <= rule.finishNearCompleteThresholdMinutes &&
      finishBeforeLatest;

    if (nearComplete) {
      cursor += remaining;
      remaining = 0;
      projected.push({
        code: rule.code,
        label: rule.label,
        startMinutes: cursor,
        durationMinutes: rule.durationMinutes,
        mode: "AFTER_WORK",
      });
      break;
    }

    projected.push({
      code: rule.code,
      label: rule.label,
      startMinutes: cursor,
      durationMinutes: rule.durationMinutes,
      mode: "INTERRUPT_WORK",
    });
    cursor += rule.durationMinutes;
  }

  if (remaining > 0) cursor += remaining;

  return {
    startMinutes: start,
    endMinutes: cursor,
    workMinutes: Math.max(0, Math.round(args.workMinutes)),
    elapsedMinutes: Math.max(0, cursor - start),
    breaks: projected,
  };
}

export function nextDueWorkdayBreak(args: {
  minute: number;
  breaks: ResolvedWorkdayBreak[];
  alreadyTakenBreakCodes?: Iterable<string>;
}) {
  const taken = new Set(
    [...(args.alreadyTakenBreakCodes ?? [])].map((code) => code.trim().toUpperCase()),
  );
  const minute = Math.max(0, Math.round(args.minute));
  return args.breaks.find((rule) => !taken.has(rule.code) && rule.latestStartMinutes >= minute) ?? null;
}
