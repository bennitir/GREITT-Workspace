export const WORK_START_RULE_KINDS = [
  "GPS_PROGRESS",
  "CHAIN_COUNT",
  "START_PHOTO",
] as const;

export type WorkStartRuleKind = (typeof WORK_START_RULE_KINDS)[number];

export type WorkStartRuleSnapshot = {
  kind: string;
  required: boolean;
  config?: unknown;
};

export type WorkStartContextSnapshot = {
  version: 1;
  workKeyId: number | null;
  rules: Array<{ kind: string; required: boolean }>;
  gpsAcknowledgedAt: string | null;
  chainCount: number | null;
  startPhoto: {
    storagePath: string;
    fileName: string | null;
    mimeType: string | null;
  } | null;
};

export function isBuiltInWorkStartRuleKind(value: string): value is WorkStartRuleKind {
  return (WORK_START_RULE_KINDS as readonly string[]).includes(value);
}

export function normalizeWorkStartRules(value: unknown): WorkStartRuleSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { kind?: unknown; required?: unknown; config?: unknown } => Boolean(item) && typeof item === "object")
    .map((item) => ({
      kind: String(item.kind ?? "").trim(),
      required: item.required !== false,
      config: item.config,
    }))
    .filter((item) => Boolean(item.kind));
}

export function workStartRuleEnabled(rules: readonly WorkStartRuleSnapshot[], kind: WorkStartRuleKind) {
  return rules.some((rule) => rule.kind === kind);
}

export function hasWorkStartRules(rules: readonly WorkStartRuleSnapshot[]) {
  return rules.some((rule) => isBuiltInWorkStartRuleKind(rule.kind));
}

export function normalizeWorkStartContext(value: unknown): WorkStartContextSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rules = normalizeWorkStartRules(raw.rules);
  const rawPhoto = raw.startPhoto;
  let startPhoto: WorkStartContextSnapshot["startPhoto"] = null;
  if (rawPhoto && typeof rawPhoto === "object" && !Array.isArray(rawPhoto)) {
    const photo = rawPhoto as Record<string, unknown>;
    const storagePath = String(photo.storagePath ?? "").trim();
    if (storagePath) {
      startPhoto = {
        storagePath,
        fileName: photo.fileName ? String(photo.fileName) : null,
        mimeType: photo.mimeType ? String(photo.mimeType) : null,
      };
    }
  }

  const rawChainCount = raw.chainCount;
  const chainCount = typeof rawChainCount === "number" && Number.isInteger(rawChainCount) && rawChainCount >= 0
    ? rawChainCount
    : null;

  return {
    version: 1,
    workKeyId: typeof raw.workKeyId === "number" && Number.isInteger(raw.workKeyId) ? raw.workKeyId : null,
    rules: rules.map((rule) => ({ kind: rule.kind, required: rule.required })),
    gpsAcknowledgedAt: raw.gpsAcknowledgedAt ? String(raw.gpsAcknowledgedAt) : null,
    chainCount,
    startPhoto,
  };
}
