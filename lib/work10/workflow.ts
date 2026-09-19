import type { Work10PartStatus } from "@/lib/work10/domain";

export const WORK10_PART_STATUSES: Work10PartStatus[] = [
  "PLANNED",
  "READY",
  "IN_PROGRESS",
  "ON_HOLD",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
];

const PART_STATUS_SET = new Set<string>(WORK10_PART_STATUSES);

export function isWork10PartStatus(value: string): value is Work10PartStatus {
  return PART_STATUS_SET.has(value);
}

export function isWork10PartTerminalStatus(status: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

export type Work10DependencyEdge = {
  predecessorPartId: number;
  successorPartId: number;
};

export type Work10WorkflowPart = {
  id: number;
  status: string;
};

export function work10UnresolvedPredecessorIds(
  successorPartId: number,
  parts: Work10WorkflowPart[],
  dependencies: Work10DependencyEdge[],
) {
  const statusById = new Map(parts.map((part) => [part.id, part.status]));

  return dependencies
    .filter((dependency) => dependency.successorPartId === successorPartId)
    .map((dependency) => dependency.predecessorPartId)
    .filter((predecessorPartId) => {
      const status = statusById.get(predecessorPartId);
      return !status || !isWork10PartTerminalStatus(status);
    });
}

export function work10StatusRequiresResolvedDependencies(status: Work10PartStatus) {
  return status === "READY" || status === "IN_PROGRESS" || status === "COMPLETED";
}

/**
 * Athugar hvort ný FINISH_TO_START tenging myndi mynda hring.
 * Ef nú þegar er leið frá fyrirhuguðum successor aftur að predecessor,
 * myndi nýja brúnin loka hringnum og er því óheimil.
 */
export function work10DependencyWouldCreateCycle(
  predecessorPartId: number,
  successorPartId: number,
  dependencies: Work10DependencyEdge[],
) {
  if (predecessorPartId === successorPartId) return true;

  const nextByPartId = new Map<number, number[]>();
  for (const dependency of dependencies) {
    const existing = nextByPartId.get(dependency.predecessorPartId) ?? [];
    existing.push(dependency.successorPartId);
    nextByPartId.set(dependency.predecessorPartId, existing);
  }

  const queue = [successorPartId];
  const seen = new Set<number>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === predecessorPartId) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const next of nextByPartId.get(current) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }

  return false;
}
