/**
 * WorkOrder heldur áfram að vera yfirheiti Verks, en WorkPart segir til um
 * raunverulega framkvæmd. Eldri/legacy status má því ekki læsa Verki ef
 * varanlegur Verkþáttur er enn opinn.
 */
export function isWork10PartTerminal(status: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function hasOpenWork10Parts(parts: Array<{ status: string }>) {
  return parts.some((part) => !isWork10PartTerminal(part.status));
}

export function isWork10EffectivelyCompleted(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
) {
  if (workOrderStatus !== "COMPLETED") return false;

  // Legacy Verk án varanlegra Verkþátta halda sinni upprunalegu stöðu.
  if (parts.length === 0) return true;

  return !hasOpenWork10Parts(parts);
}

export function effectiveWork10Status(
  workOrderStatus: string,
  parts: Array<{ status: string }>,
) {
  if (workOrderStatus === "COMPLETED" && hasOpenWork10Parts(parts)) {
    return "IN_PROGRESS";
  }

  return workOrderStatus;
}
