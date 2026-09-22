"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode, type UIEvent } from "react";
import { applyWorkdayStaffingPlan, assignPersonToWorkPart, persistLegacyFirstWorkPart, updateWorkOrderPlanning } from "@/app/verk/[id]/actions";
import { work10FormatDate, work10PriorityText, work10StatusText, work10Text } from "@/lib/i18n/work10";
import { workTimeText } from "@/lib/i18n/work-time";
import { workResourceKindText, workResourceStatusText, workResourceText } from "@/lib/i18n/work-resources";
import { workKeyText } from "@/lib/i18n/work-keys";
import { work10ClockFromMinutes, work10ScheduleRangesOverlap } from "@/lib/work10/scheduling";
import { projectWorkWindowWithBreaks, resolveWorkdayBreaks, type ProjectedBreak } from "@/lib/work10/workday-policy";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import IcelandicTimeInput from "@/components/ui/IcelandicTimeInput";

type ActualLaborData = {
  id: string;
  userId: number | null;
  employeeId: number | null;
  userName: string | null;
  workDate: string;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number;
  description: string | null;
  source: "WORK_PART_FACT" | "LEGACY_WORK_LOG" | "EMPLOYEE_WORK_DIARY";
  workPartId: number | null;
  operationalLocationId?: number | null;
  workKey?: string | null;
};

type AssignedResourceData = {
  id: number;
  kind: string;
  name: string;
  status: string;
  qualificationCode: string | null;
};

type StaffingRequirementData = {
  id: number;
  sequence: number;
  roleCode: string;
  quantity: number;
  staffingRoleId: number | null;
  workScopeId: number | null;
  workScopeCode: string | null;
  workScopeName: string | null;
  requiredQualificationCodes: string[];
  preferredQualificationCodes: string[];
};

type WorkPartData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  order: number;
  dependencies: Array<{ predecessorPartId: string; successorPartId: string }>;
  source:
    | { kind: "LEGACY_WORK_ORDER"; sourceId: string }
    | { kind: "WORK_PART"; sourceId: string };
  persistedInWork10: boolean;
  requiredPeople: number;
  estimatedMinutes: number | null;
  photoRequirement: string;
  workScopeId: number | null;
  workScopeCode: string | null;
  workScopeName: string | null;
  requiredQualificationCodes: string[];
  staffingRequirements: StaffingRequirementData[];
  assignedEmployeeIds: number[];
  assignedResources: AssignedResourceData[];
};

type WorkOrderData = {
  id: number;
  workNumber: string;
  workKey: string | null;
  externalId: string | null;
  title: string;
  description: string | null;
  address: string | null;
  responsibleDepartmentId: number | null;
  responsibleDepartmentCode: string | null;
  responsibleDepartmentName: string | null;
  locationDepartmentId: number | null;
  locationDepartmentCode: string | null;
  locationDepartmentName: string | null;
  operationalLocationId: number | null;
  operationalLocationCode: string | null;
  operationalLocationName: string | null;
  priority: string;
  requiredPeople: number;
  estimatedMinutes: number | null;
  plannedDate: string | null;
  plannedStartMinutes: number | null;
  plannedEndMinutes: number | null;
  completionDeadlineDate: string | null;
  completionDeadlineMinutes: number | null;
  allowAfterWorkdayEnd: boolean;
  workdayEndExceptionReason: string | null;
  photoRequirement: string;
  status: string;
  readyToClose: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
  workParts: WorkPartData[];
  actualLabor: ActualLaborData[];
};

type PersonData = {
  id: number;
  name: string;
  jobTitle: string | null;
  department: string | null;
  departmentId: number | null;
  departmentCode: string | null;
  fixedTeamIds: number[];
  fixedTeamNames: string[];
  primaryFixedTeamId: number | null;
  baseOperationalLocationId: number | null;
  baseOperationalLocationCode: string | null;
  baseOperationalLocationName: string | null;
  userId: number | null;
  workplaceScheduleProfileId: number | null;
  laborAgreementProfileId: number | null;
  staffingRoleIds: number[];
  workScopeIds: number[];
  incidentalWorkMode: string;
  workExecutionMode: string;
  qualificationCodes: string[];
  qualificationTitles: string[];
};

type ResourceData = {
  id: number;
  kind: string;
  code: string;
  name: string;
  status: string;
  baseUnit: string | null;
  customUnit: string | null;
  meterValue: number | null;
  meterUnit: string | null;
  activeAssignmentCount: number;
  memberCount: number;
  memberEmployeeIds: number[];
  description: string | null;
};


type TravelRouteData = {
  id: number;
  fromLocationId: number;
  fromLocationCode: string;
  fromLocationName: string;
  toLocationId: number;
  toLocationCode: string;
  toLocationName: string;
  distanceKm: number;
  defaultMinutes: number;
  source: string;
  timeWindows: Array<{
    dayType: string;
    startMinutes: number;
    endMinutes: number;
    travelMinutes: number;
    ruleCode: string | null;
    source: string;
  }>;
};

type TravelEstimate = {
  fromLocationId: number;
  fromLocationName: string;
  toLocationId: number;
  toLocationName: string;
  distanceKm: number;
  travelMinutes: number;
  source: string;
  trafficRuleCode: string | null;
};

type PairingData = {
  employeeAId: number;
  employeeBId: number;
  count: number;
};

type WorkdayProfileData = {
  id: number;
  name: string;
  address: string | null;
  dayStartMinutes: number;
  standardWorkMinutes: number;
  isDefault: boolean;
  breaks: Array<{
    code: string;
    label: string;
    targetStartMinutes: number;
    durationMinutes: number;
    flexibleBeforeMinutes: number;
    flexibleAfterMinutes: number;
    allowFinishNearCompleteWork: boolean;
    finishNearCompleteThresholdMinutes: number;
  }>;
};

type LaborAgreementProfileData = {
  id: number;
  name: string;
  interpretationStatus: string;
  breakRules: Array<{
    breakCode: string;
    minimumShiftMinutes: number;
    entitlementMinutes: number | null;
    paidBreak: boolean | null;
    missedBreakTreatment: string;
  }>;
};

export type Work10DashboardData = {
  language: string;
  capabilities: {
    machines: boolean;
  };
  workOrders: WorkOrderData[];
  independentLabor: ActualLaborData[];
  people: PersonData[];
  resources: ResourceData[];
  pairings: PairingData[];
  workdayProfiles: WorkdayProfileData[];
  laborAgreementProfiles: LaborAgreementProfileData[];
  travelRoutes: TravelRouteData[];
  initialDate: string;
};

type MainTab = "schedule" | "list" | "queue" | "map" | "machines" | "docs" | "reports";
type ResourceTab = "people" | "machines" | "teams";
type CalendarMode = "day" | "week" | "month";
type LaborPeriod = "day" | "week" | "month" | "all";
type PersonAvailability = "working" | "assigned" | "available";
type PersonStatusFilter = "all" | PersonAvailability;
type SnapshotKind = "actual" | "planned" | "available";
type PersonSnapshot = {
  kind: SnapshotKind;
  work: WorkOrderData | null;
};

type QualificationMatch = "matched" | "partial" | "unknown" | "missing";
type StaffingPosition = {
  key: string;
  partId: string;
  requirementId: number | null;
  roleCode: string;
  staffingRoleId: number | null;
  workScopeId: number | null;
  workScopeCode: string | null;
  workScopeName: string | null;
  requiredQualificationCodes: string[];
  preferredQualificationCodes: string[];
};

type WorkScopeMatch = "normal" | "incidental_auto" | "incidental_manual" | "legacy";
type StaffingCandidate = {
  person: PersonData;
  position: StaffingPosition;
  score: number;
  availability: PersonAvailability;
  qualificationMatch: QualificationMatch;
  matchedQualificationCodes: string[];
  missingQualificationCodes: string[];
  preferredQualificationMatchCount: number;
  pairingCount: number;
  teamMatchCount: number;
  fixedTeamMatchCount: number;
  dayTeamContinuityCount: number;
  workScopeMatch: WorkScopeMatch;
  autoEligible: boolean;
  travelEstimate: TravelEstimate | null;
  reasons: string[];
};

type DayLaborEntry = ActualLaborData & { workId: number | null; workTitle: string };

type StaffingSelectionContext = {
  projectedAvailableAt?: Map<number, number>;
  dayPairingCountByKey?: Map<string, number>;
  recentTeammatesByEmployeeId?: Map<number, Set<number>>;
  projectedLocationByEmployeeId?: Map<number, number | null>;
  locationPreferredEmployeeIds?: Set<number>;
  locationCoverageBonusByEmployeeId?: Map<number, number>;
  locationDeparturePenaltyByEmployeeId?: Map<number, number>;
  loadAllowedEmployeeIds?: Set<number>;
  loadScoreAdjustmentByEmployeeId?: Map<number, number>;
  planningDateIso?: string;
  dayLabor?: DayLaborEntry[];
  scheduledWorks?: WorkOrderData[];
};

type StaffingPlanBuildResult = {
  plan: StaffingPlanItem[];
  worksNeedPeople: WorkOrderData[];
};

type StaffingPeriodDayPlan = {
  dateIso: string;
  plan: StaffingPlanItem[];
  worksNeedPeopleCount: number;
};

type StaffingPlanItem = {
  workId: number;
  employeeId: number;
  score: number;
  targetPartId: string | null;
  roleCode: string;
  requiredQualificationCodes: string[];
  plannedStartMinutes: number;
  projectedEndMinutes: number | null;
  projectedAvailableMinutes: number | null;
  projectedBreaks: ProjectedBreak[];
  fixedTeamMatchCount: number;
  dayTeamContinuityCount: number;
  workScopeMatch: WorkScopeMatch;
  travelFromLocationId: number | null;
  travelFromLocationName: string | null;
  travelToLocationId: number | null;
  travelToLocationName: string | null;
  travelDepartureMinutes: number | null;
  travelMinutes: number;
  travelDistanceKm: number;
  travelSource: string | null;
  trafficRuleCode: string | null;
  returnFromLocationId: number | null;
  returnFromLocationName: string | null;
  returnToLocationId: number | null;
  returnToLocationName: string | null;
  returnDepartureMinutes: number | null;
  returnMinutes: number;
  returnDistanceKm: number;
  returnSource: string | null;
  returnTrafficRuleCode: string | null;
};

const INCIDENTAL_AUTO_WAIT_MINUTES = 30;
const FIXED_TEAM_CONTINUITY_BONUS = 95;
const FIXED_TEAM_POTENTIAL_BONUS = 55;
const RECENT_TEAM_CONTINUITY_BONUS = 110;
const DAY_PAIRING_BONUS_PER_MATCH = 18;
const DAY_PAIRING_BONUS_CAP = 72;
const SAME_LOCATION_BONUS = 80;
const TRAVEL_MINUTE_PENALTY = 3;
const TRAVEL_KM_PENALTY = 0.5;
const LOCATION_CLUSTER_EXISTING_BONUS = 260;
const LOCATION_CLUSTER_COVERAGE_BONUS_CAP = 180;
const LOCATION_CLUSTER_NEW_DISPATCH_MINUTES = 20;
const LOCATION_CLUSTER_WAIT_MAX_MINUTES = 180;
const LOCATION_CLUSTER_DEPARTURE_PENALTY = 320;
const LOCATION_CLUSTER_DEPARTURE_EXTRA_PER_WORK = 35;
const REGION_DIAGNOSTIC_MIN_TRAVEL_MINUTES = 10;
const EMPLOYEE_LOAD_TARGET_PERCENT = 85;
const EMPLOYEE_LOAD_HARD_MAX_PERCENT = 93;
const EMPLOYEE_LOAD_DENSE_PERCENT = 90;
const EMPLOYEE_LOAD_LOW_BUFFER_MINUTES = 30;
const EMPLOYEE_LOAD_HIGH_TRAVEL_MINUTES = 120;
const EMPLOYEE_LOAD_MANY_LOCATION_CHANGES = 4;

const TIMELINE_WINDOW_MINUTES = 10 * 60;
const TIMELINE_DEFAULT_START_MINUTES = 7 * 60;
const TIMELINE_MIN_START_MINUTES = 0;
const TIMELINE_MAX_START_MINUTES = 24 * 60 - TIMELINE_WINDOW_MINUTES;
const TIMELINE_STEP_MINUTES = 60;
const PEOPLE_ROW_HEIGHT = 68;
const PEOPLE_VIEWPORT_HEIGHT = 510;
const PEOPLE_OVERSCAN = 6;

function clampTimelineStart(value: number) {
  return Math.max(TIMELINE_MIN_START_MINUTES, Math.min(TIMELINE_MAX_START_MINUTES, value));
}

function currentMinuteOfDay() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function parseClockText(value: string) {
  const text = value.trim();
  if (!text) return null;

  const hourOnly = /^(\d{1,2})$/.exec(text);
  if (hourOnly) {
    const hour = Number(hourOnly[1]);
    return hour >= 0 && hour <= 23 ? hour * 60 : null;
  }

  const compact = /^(\d{3,4})$/.exec(text);
  if (compact) {
    const digits = compact[1].padStart(4, "0");
    const hour = Number(digits.slice(0, 2));
    const minute = Number(digits.slice(2));
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  }

  const clock = /^(\d{1,2}):(\d{1,2})$/.exec(text);
  if (!clock) return null;
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

function snapshotStatusLabel(kind: SnapshotKind, t: ReturnType<typeof work10Text>) {
  if (kind === "actual") return t.snapshotActual;
  if (kind === "planned") return t.snapshotPlanned;
  return t.snapshotAvailable;
}

function timelineStartForCurrentMinute(minuteOfDay: number) {
  const currentHourStart = Math.floor(minuteOfDay / 60) * 60;
  return clampTimelineStart(currentHourStart - 2 * 60);
}

function timelineHours(startMinutes: number) {
  return Array.from({ length: TIMELINE_WINDOW_MINUTES / 60 }, (_, index) => {
    const minute = startMinutes + index * 60;
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:00`;
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function dateFromIsoDate(value: string | null | undefined) {
  if (!value) return new Date(Date.UTC(2000, 0, 1, 12, 0, 0, 0));

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(Date.UTC(2000, 0, 1, 12, 0, 0, 0));

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function addIsoDays(value: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isoDateFromDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function sameLocalDay(iso: string, selected: Date) {
  const d = new Date(iso);
  return (
    d.getUTCFullYear() === selected.getUTCFullYear() &&
    d.getUTCMonth() === selected.getUTCMonth() &&
    d.getUTCDate() === selected.getUTCDate()
  );
}

function minuteOfDayFromIso(value: string) {
  const d = new Date(value);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function timelinePosition(
  startMinuteOfDay: number,
  durationMinutes: number | null,
  timelineStartMinutes: number,
  timelineEndMinutes: number,
) {
  const timelineDurationMinutes = timelineEndMinutes - timelineStartMinutes;
  const clippedStart = Math.max(timelineStartMinutes, Math.min(timelineEndMinutes, startMinuteOfDay));
  const rawDuration = Math.max(1, durationMinutes ?? 1);
  const clippedEnd = Math.max(clippedStart + 1, Math.min(timelineEndMinutes, startMinuteOfDay + rawDuration));
  const left = ((clippedStart - timelineStartMinutes) / timelineDurationMinutes) * 100;
  const width = ((clippedEnd - clippedStart) / timelineDurationMinutes) * 100;
  return { left: `${left}%`, width: `${Math.max(width, 0.35)}%` };
}

function laborTimelinePosition(
  startedAt: string,
  endedAt: string | null,
  durationMinutes: number | null,
  timelineStartMinutes: number,
  timelineEndMinutes: number,
) {
  const start = minuteOfDayFromIso(startedAt);
  let duration = durationMinutes ?? 1;
  if (endedAt) {
    const diff = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000);
    if (diff > 0) duration = diff;
  }
  return timelinePosition(start, duration, timelineStartMinutes, timelineEndMinutes);
}

function isInsideVisibleTimeline(startMinutes: number | null, timelineStartMinutes: number, timelineEndMinutes: number) {
  return startMinutes !== null && startMinutes >= timelineStartMinutes && startMinutes < timelineEndMinutes;
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
        active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-950"
      }`}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: PersonAvailability }) {
  const color = status === "working" ? "bg-emerald-500" : status === "assigned" ? "bg-amber-400" : "bg-slate-400";
  return <span className={`h-2.5 w-2.5 rounded-full ${color}`} />;
}

function isTerminalPartStatus(status: string) {
  return status === "COMPLETED" || status === "CANCELLED";
}

function employeeIdFromDrag(event: DragEvent<HTMLElement>) {
  const raw = event.dataTransfer.getData("application/x-gloggt-employee") || event.dataTransfer.getData("text/plain");
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function formatMinutesDuration(minutes: number, hourLabel: string, minuteLabel: string) {
  const safe = Math.max(0, Math.round(minutes));
  const hoursPart = Math.floor(safe / 60);
  const minutesPart = safe % 60;
  if (hoursPart > 0 && minutesPart > 0) return `${hoursPart} ${hourLabel} ${minutesPart} ${minuteLabel}`;
  if (hoursPart > 0) return `${hoursPart} ${hourLabel}`;
  return `${minutesPart} ${minuteLabel}`;
}


function directionsUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

function laborMatchesPeriod(workDate: string, selectedDate: Date, period: LaborPeriod) {
  if (period === "all") return true;
  const date = new Date(workDate);
  const selectedYear = selectedDate.getUTCFullYear();
  const selectedMonth = selectedDate.getUTCMonth();
  const selectedDay = selectedDate.getUTCDate();
  if (period === "day") {
    return date.getUTCFullYear() === selectedYear && date.getUTCMonth() === selectedMonth && date.getUTCDate() === selectedDay;
  }
  if (period === "month") {
    return date.getUTCFullYear() === selectedYear && date.getUTCMonth() === selectedMonth;
  }
  const selectedWeekStart = new Date(Date.UTC(selectedYear, selectedMonth, selectedDay, 12));
  const weekday = selectedWeekStart.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  selectedWeekStart.setUTCDate(selectedWeekStart.getUTCDate() + mondayOffset);
  const selectedWeekEnd = new Date(selectedWeekStart);
  selectedWeekEnd.setUTCDate(selectedWeekEnd.getUTCDate() + 7);
  return date >= selectedWeekStart && date < selectedWeekEnd;
}

function assignedEmployeeIdsForWork(work: WorkOrderData) {
  return [...new Set(work.workParts.flatMap((part) => part.assignedEmployeeIds))];
}

function assignedPeopleCount(work: WorkOrderData) {
  return assignedEmployeeIdsForWork(work).length;
}

function uniqueQualificationCodes(codes: string[]) {
  return [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
}

function staffingPartForWork(work: WorkOrderData) {
  const openParts = work.workParts.filter((part) => !isTerminalPartStatus(part.status));
  return openParts.find((part) => part.assignedEmployeeIds.length < Math.max(1, part.requiredPeople)) ?? openParts[0] ?? null;
}

function staffingPositionsForPart(part: WorkPartData): StaffingPosition[] {
  const commonCodes = uniqueQualificationCodes(part.requiredQualificationCodes);
  const positions: StaffingPosition[] = [];

  for (const requirement of part.staffingRequirements) {
    const quantity = Math.max(0, requirement.quantity);
    for (let index = 0; index < quantity; index += 1) {
      positions.push({
        key: `${part.id}:${requirement.id}:${index}`,
        partId: part.id,
        requirementId: requirement.id,
        roleCode: requirement.roleCode || "GENERAL",
        staffingRoleId: requirement.staffingRoleId,
        workScopeId: requirement.workScopeId ?? part.workScopeId,
        workScopeCode: requirement.workScopeCode ?? part.workScopeCode,
        workScopeName: requirement.workScopeName ?? part.workScopeName,
        requiredQualificationCodes: uniqueQualificationCodes([
          ...commonCodes,
          ...requirement.requiredQualificationCodes,
        ]),
        preferredQualificationCodes: uniqueQualificationCodes(requirement.preferredQualificationCodes),
      });
    }
  }

  const configuredPeople = positions.length;
  const fallbackPeople = Math.max(1, part.requiredPeople) - configuredPeople;
  for (let index = 0; index < Math.max(0, fallbackPeople); index += 1) {
    positions.push({
      key: `${part.id}:fallback:${index}`,
      partId: part.id,
      requirementId: null,
      roleCode: "GENERAL",
      staffingRoleId: null,
      workScopeId: part.workScopeId,
      workScopeCode: part.workScopeCode,
      workScopeName: part.workScopeName,
      requiredQualificationCodes: commonCodes,
      preferredQualificationCodes: [],
    });
  }

  // Gamalt Verk án mönnunarsamsetningar heldur áfram að virka eins og áður.
  if (positions.length === 0) {
    positions.push({
      key: `${part.id}:fallback:0`,
      partId: part.id,
      requirementId: null,
      roleCode: "GENERAL",
      staffingRoleId: null,
      workScopeId: part.workScopeId,
      workScopeCode: part.workScopeCode,
      workScopeName: part.workScopeName,
      requiredQualificationCodes: commonCodes,
      preferredQualificationCodes: [],
    });
  }

  return positions;
}

function positionConstraintRank(position: StaffingPosition) {
  const roleRank = position.roleCode === "SPECIALIST" || position.roleCode === "DRIVER" || position.roleCode === "OPERATOR"
    ? 0
    : position.roleCode === "ASSISTANT"
      ? 2
      : 1;
  return roleRank * 100 - (position.staffingRoleId ? 25 : 0) - position.requiredQualificationCodes.length * 10 - position.preferredQualificationCodes.length;
}

function workScopeMatchForPerson(person: PersonData, position: StaffingPosition): WorkScopeMatch | "blocked" {
  if (!position.workScopeId) return "legacy";
  if (person.workScopeIds.includes(position.workScopeId)) return "normal";
  if (person.incidentalWorkMode === "AUTO_IF_NEEDED") return "incidental_auto";
  if (person.incidentalWorkMode === "MANUAL_ONLY") return "incidental_manual";
  return "blocked";
}

function departmentAllowsPerson(person: PersonData, work: WorkOrderData) {
  if (!work.responsibleDepartmentId) return true;
  return person.departmentId === work.responsibleDepartmentId;
}

function sharedFixedTeamCount(left: PersonData, right: PersonData) {
  if (left.fixedTeamIds.length === 0 || right.fixedTeamIds.length === 0) return 0;
  const rightIds = new Set(right.fixedTeamIds);
  return left.fixedTeamIds.filter((teamId) => rightIds.has(teamId)).length;
}

function personMatchesPosition(person: PersonData, position: StaffingPosition) {
  if (workScopeMatchForPerson(person, position) === "blocked") return false;
  if (position.staffingRoleId && !person.staffingRoleIds.includes(position.staffingRoleId)) return false;
  if (position.requiredQualificationCodes.length === 0) return true;
  const codes = new Set(person.qualificationCodes.map((code) => code.toUpperCase()));
  return position.requiredQualificationCodes.every((code) => codes.has(code));
}

function openStaffingPositionsForWork(work: WorkOrderData, people: PersonData[]) {
  const part = staffingPartForWork(work);
  if (!part) return [] as StaffingPosition[];

  const positions = staffingPositionsForPart(part).slice().sort((a, b) =>
    positionConstraintRank(a) - positionConstraintRank(b) || a.key.localeCompare(b.key),
  );
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const remainingAssigned = part.assignedEmployeeIds
    .map((employeeId) => peopleById.get(employeeId) ?? null)
    .filter((person): person is PersonData => person !== null);
  const filled = new Set<string>();

  // Fyrst fyllum við þrengstu sætin með þeim sem þegar eru á Verkþættinum.
  // Þannig telst almennur aðstoðarmaður ekki óvart sem fagmaður.
  for (const position of positions) {
    const matching = remainingAssigned
      .map((person, index) => ({ person, index }))
      .filter(({ person }) => personMatchesPosition(person, position))
      .sort((a, b) => {
        const aCodes = new Set(a.person.qualificationCodes.map((code) => code.toUpperCase()));
        const bCodes = new Set(b.person.qualificationCodes.map((code) => code.toUpperCase()));
        const aPreferred = position.preferredQualificationCodes.filter((code) => aCodes.has(code)).length;
        const bPreferred = position.preferredQualificationCodes.filter((code) => bCodes.has(code)).length;
        return bPreferred - aPreferred || a.person.qualificationCodes.length - b.person.qualificationCodes.length || a.person.name.localeCompare(b.person.name);
      });
    const selected = matching[0];
    if (!selected) continue;
    filled.add(position.key);
    remainingAssigned.splice(selected.index, 1);
  }

  return positions.filter((position) => !filled.has(position.key));
}

function staffingDeficit(work: WorkOrderData, people?: PersonData[]) {
  if (people) return openStaffingPositionsForWork(work, people).length;
  return Math.max(0, Math.max(1, work.requiredPeople) - assignedPeopleCount(work));
}

function staffingNeedsAttention(work: WorkOrderData, people?: PersonData[]) {
  if (staffingDeficit(work, people) <= 0) return false;
  if (assignedPeopleCount(work) > 0) return true;
  if (work.plannedDate) return true;
  return work.status === "READY" || work.status === "IN_PROGRESS";
}

function staffingRank(work: WorkOrderData, people?: PersonData[]) {
  const assigned = assignedPeopleCount(work);
  const deficit = staffingDeficit(work, people);
  if (deficit <= 0) return 2;
  return assigned === 0 ? 0 : 1;
}

function storedPlannedEndMinutes(work: WorkOrderData) {
  if (work.plannedStartMinutes === null) return null;
  if (work.plannedEndMinutes !== null && work.plannedEndMinutes > work.plannedStartMinutes) return work.plannedEndMinutes;
  if (!work.estimatedMinutes || work.estimatedMinutes <= 0) return null;
  return work.plannedStartMinutes + Math.max(1, work.estimatedMinutes);
}

function storedPlannedDurationMinutes(work: WorkOrderData) {
  const end = storedPlannedEndMinutes(work);
  return end !== null && work.plannedStartMinutes !== null ? Math.max(1, end - work.plannedStartMinutes) : work.estimatedMinutes;
}

function plannedWorkSortValue(work: WorkOrderData) {
  if (!work.plannedDate) return Number.MAX_SAFE_INTEGER;
  const [year, month, day] = work.plannedDate.split("-").map(Number);
  if (!year || !month || !day) return Number.MAX_SAFE_INTEGER;
  const minute = work.plannedStartMinutes ?? 24 * 60;
  return Date.UTC(year, month - 1, day, 0, minute);
}

function requiredQualificationCodesForWork(work: WorkOrderData) {
  return uniqueQualificationCodes([
    ...work.workParts.flatMap((part) => part.requiredQualificationCodes),
    ...work.workParts.flatMap((part) => part.staffingRequirements.flatMap((requirement) => requirement.requiredQualificationCodes)),
    ...work.workParts
      .flatMap((part) => part.assignedResources)
      .map((resource) => resource.qualificationCode)
      .filter((code): code is string => Boolean(code)),
  ]);
}

function assignedResourcesForWork(work: WorkOrderData) {
  const byId = new Map<number, AssignedResourceData>();
  for (const resource of work.workParts.flatMap((part) => part.assignedResources)) byId.set(resource.id, resource);
  return [...byId.values()];
}

function blockedResourcesForWork(work: WorkOrderData) {
  return assignedResourcesForWork(work).filter((resource) =>
    ["MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"].includes(resource.status),
  );
}

function activePriorityRank(priority: string) {
  if (priority === "URGENT") return 0;
  if (priority === "HIGH") return 1;
  if (priority === "NORMAL") return 2;
  return 3;
}

function isoDateOrdinal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000);
}

function completionDeadlineAbsoluteMinutes(work: WorkOrderData) {
  if (!work.completionDeadlineDate || work.completionDeadlineMinutes === null) return null;
  const day = isoDateOrdinal(work.completionDeadlineDate);
  if (day === null) return null;
  return day * 24 * 60 + work.completionDeadlineMinutes;
}

function selectedAbsoluteMinutes(dateIso: string, minute: number) {
  const day = isoDateOrdinal(dateIso);
  return day === null ? null : day * 24 * 60 + minute;
}

function deadlineSlackMinutes(work: WorkOrderData, dateIso: string, minute: number) {
  const deadline = completionDeadlineAbsoluteMinutes(work);
  const now = selectedAbsoluteMinutes(dateIso, minute);
  if (deadline === null || now === null) return null;
  const workMinutes = Math.max(0, work.estimatedMinutes ?? 0);
  return deadline - now - workMinutes;
}

/**
 * Deadline má aðeins hækka forgang, aldrei lækka handvirkan forgang. Langt
 * deadline hefur því engin áhrif en færist stigvaxandi upp þegar svigrúm minnkar.
 */
function effectivePriorityRank(work: WorkOrderData, dateIso: string, minute: number) {
  const manualRank = activePriorityRank(work.priority);
  const slack = deadlineSlackMinutes(work, dateIso, minute);
  if (slack === null) return manualRank;
  const deadlineRank = slack <= 120 ? 0 : slack <= 8 * 60 ? 1 : slack <= 3 * 24 * 60 ? 2 : 3;
  return Math.min(manualRank, deadlineRank);
}

function deadlinePressureRank(work: WorkOrderData, dateIso: string, minute: number) {
  const slack = deadlineSlackMinutes(work, dateIso, minute);
  if (slack === null) return 4;
  if (slack <= 120) return 0;
  if (slack <= 8 * 60) return 1;
  if (slack <= 3 * 24 * 60) return 2;
  if (slack <= 14 * 24 * 60) return 3;
  return 4;
}

function activeStatusRank(status: string) {
  if (status === "IN_PROGRESS") return 0;
  if (status === "READY") return 1;
  if (status === "DRAFT") return 2;
  return 3;
}

function travelDayType(dateIso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return "ALL";
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
  if (day === 0) return "SUNDAY";
  if (day === 6) return "SATURDAY";
  return "WEEKDAY";
}

function roundUpToFiveMinutes(value: number) {
  return Math.ceil(value / 5) * 5;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

export default function Work10Dashboard({ data }: { data: Work10DashboardData }) {
  const router = useRouter();
  const t = work10Text(data.language);
  const workTimeT = workTimeText(data.language);
  const resourceT = workResourceText(data.language);
  const workKeyT = workKeyText(data.language);
  const [mainTab, setMainTab] = useState<MainTab>("schedule");
  const [resourceTab, setResourceTab] = useState<ResourceTab>("people");
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("day");
  const activeWorkOrders = useMemo(
    () =>
      data.workOrders
        .filter((work) => work.status !== "COMPLETED" && work.status !== "CANCELLED")
        .slice()
        .sort((a, b) => {
          const priorityDiff = activePriorityRank(a.priority) - activePriorityRank(b.priority);
          if (priorityDiff !== 0) return priorityDiff;
          const attentionDiff = Number(staffingNeedsAttention(b, data.people)) - Number(staffingNeedsAttention(a, data.people));
          if (attentionDiff !== 0) return attentionDiff;
          const deadlineDiff = (completionDeadlineAbsoluteMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (completionDeadlineAbsoluteMinutes(b) ?? Number.MAX_SAFE_INTEGER);
          if (deadlineDiff !== 0) return deadlineDiff;
          const plannedDiff = plannedWorkSortValue(a) - plannedWorkSortValue(b);
          if (plannedDiff !== 0) return plannedDiff;
          const closeDiff = Number(b.readyToClose) - Number(a.readyToClose);
          if (closeDiff !== 0) return closeDiff;
          const statusDiff = activeStatusRank(a.status) - activeStatusRank(b.status);
          if (statusDiff !== 0) return statusDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [data.people, data.workOrders],
  );
  const completedWorkOrders = useMemo(
    () => data.workOrders.filter((work) => work.status === "COMPLETED" || work.status === "CANCELLED"),
    [data.workOrders],
  );

  const workMatchesSearch = (work: WorkOrderData, query: string) => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return true;
    const assignedNames = work.workParts
      .flatMap((part) => part.assignedEmployeeIds)
      .map((employeeId) => data.people.find((person) => person.id === employeeId)?.name ?? "")
      .join(" ");
    return `${work.title} ${work.description ?? ""} ${work.address ?? ""} ${work.workNumber} ${work.workKey ?? ""} ${work.externalId ?? ""} ${assignedNames}`
      .toLocaleLowerCase()
      .includes(q);
  };

  const fallbackInitialDate = data.initialDate ?? activeWorkOrders[0]?.createdAt?.slice(0, 10) ?? data.workOrders[0]?.createdAt?.slice(0, 10) ?? "2000-01-01";
  const [selectedDate, setSelectedDate] = useState(() => dateFromIsoDate(fallbackInitialDate));
  const [selectedWorkId, setSelectedWorkId] = useState<number | null>(() => activeWorkOrders[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [staffingWorkId, setStaffingWorkId] = useState<number | null>(null);
  const [morningStaffingOpen, setMorningStaffingOpen] = useState(false);
  const [morningTimeInput, setMorningTimeInput] = useState("08:00");
  const [morningPlan, setMorningPlan] = useState<StaffingPlanItem[]>([]);
  const [periodDaysInput, setPeriodDaysInput] = useState("5");
  const [periodPlan, setPeriodPlan] = useState<StaffingPeriodDayPlan[]>([]);
  const [periodStaffingOpen, setPeriodStaffingOpen] = useState(false);
  const [periodPlanningBusy, setPeriodPlanningBusy] = useState(false);
  const [periodPlanningCompletedDays, setPeriodPlanningCompletedDays] = useState(0);
  const [periodPlanningTotalDays, setPeriodPlanningTotalDays] = useState(0);
  const [periodDetailDateIso, setPeriodDetailDateIso] = useState<string | null>(null);
  const [bulkAssignmentBusy, setBulkAssignmentBusy] = useState(false);

  const filteredActiveWorkOrders = useMemo(
    () => activeWorkOrders.filter((work) => workMatchesSearch(work, search)),
    [activeWorkOrders, data.people, search],
  );
  const filteredCompletedWorkOrders = useMemo(
    () => completedWorkOrders.filter((work) => workMatchesSearch(work, search)),
    [completedWorkOrders, data.people, search],
  );
  const [dragEmployeeId, setDragEmployeeId] = useState<number | null>(null);
  const [dropWorkId, setDropWorkId] = useState<number | null>(null);
  const [dropPartId, setDropPartId] = useState<string | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<{ employeeId: number; workId: number } | null>(null);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [laborPeriod, setLaborPeriod] = useState<LaborPeriod>("day");
  const [planningEditorOpen, setPlanningEditorOpen] = useState(false);
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [timelineStartMinutes, setTimelineStartMinutes] = useState(TIMELINE_DEFAULT_START_MINUTES);
  const [timelineFollowNow, setTimelineFollowNow] = useState(true);
  const [currentTimelineMinute, setCurrentTimelineMinute] = useState(() => currentMinuteOfDay());
  const [personStatusFilter, setPersonStatusFilter] = useState<PersonStatusFilter>("all");
  const [snapshotInput, setSnapshotInput] = useState("");
  const [snapshotMinute, setSnapshotMinute] = useState<number | null>(null);
  const [peopleScrollTop, setPeopleScrollTop] = useState(0);
  const peopleListRef = useRef<HTMLDivElement>(null);
  const peopleTimelineRef = useRef<HTMLDivElement>(null);

  const machinesEnabled = data.capabilities.machines;
  const pairingCountByKey = useMemo(() => {
    const result = new Map<string, number>();
    for (const pairing of data.pairings) {
      const a = Math.min(pairing.employeeAId, pairing.employeeBId);
      const b = Math.max(pairing.employeeAId, pairing.employeeBId);
      result.set(`${a}:${b}`, pairing.count);
    }
    return result;
  }, [data.pairings]);

  const teamIdsByEmployeeId = useMemo(() => {
    const result = new Map<number, Set<number>>();
    for (const resource of data.resources) {
      if (resource.kind !== "TEAM") continue;
      for (const employeeId of resource.memberEmployeeIds) {
        const teams = result.get(employeeId) ?? new Set<number>();
        teams.add(resource.id);
        result.set(employeeId, teams);
      }
    }
    return result;
  }, [data.resources]);
  const resourceTabs: ResourceTab[] = machinesEnabled
    ? ["people", "machines", "teams"]
    : ["people", "teams"];

  const selectedWork = activeWorkOrders.find((work) => work.id === selectedWorkId) ?? activeWorkOrders[0] ?? null;

  const filteredResources = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.resources;
    return data.resources.filter((resource) =>
      `${resource.name} ${resource.code}`.toLowerCase().includes(q),
    );
  }, [data.resources, search]);

  const machineResources = filteredResources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind));
  const teamResources = filteredResources.filter((resource) => resource.kind === "TEAM");

  const selectedDateIso = isoDateFromDate(selectedDate);
  const travelRouteByKey = useMemo(() => {
    const routes = new Map<string, TravelRouteData>();
    for (const route of data.travelRoutes) routes.set(`${route.fromLocationId}:${route.toLocationId}`, route);
    return routes;
  }, [data.travelRoutes]);
  const operationalLocationNameById = useMemo(() => {
    const names = new Map<number, string>();
    for (const route of data.travelRoutes) {
      names.set(route.fromLocationId, route.fromLocationName);
      names.set(route.toLocationId, route.toLocationName);
    }
    for (const person of data.people) {
      if (person.baseOperationalLocationId && person.baseOperationalLocationName) names.set(person.baseOperationalLocationId, person.baseOperationalLocationName);
    }
    for (const work of data.workOrders) {
      if (work.operationalLocationId && work.operationalLocationName) names.set(work.operationalLocationId, work.operationalLocationName);
    }
    return names;
  }, [data.people, data.travelRoutes, data.workOrders]);
  const travelEstimateFor = (fromLocationId: number | null | undefined, toLocationId: number | null | undefined, departureMinutes: number, dateIso: string = selectedDateIso) => {
    if (!fromLocationId || !toLocationId) return null;
    if (fromLocationId === toLocationId) {
      const name = operationalLocationNameById.get(fromLocationId) ?? t.unknown;
      return {
        fromLocationId, fromLocationName: name, toLocationId, toLocationName: name,
        distanceKm: 0, travelMinutes: 0, source: "SAME_LOCATION", trafficRuleCode: null,
      } satisfies TravelEstimate;
    }
    const route = travelRouteByKey.get(`${fromLocationId}:${toLocationId}`);
    if (!route) return null;
    const dayType = travelDayType(dateIso);
    const window = route.timeWindows.find((item) =>
      (item.dayType === "ALL" || item.dayType === dayType) &&
      departureMinutes >= item.startMinutes && departureMinutes < item.endMinutes,
    ) ?? null;
    return {
      fromLocationId, fromLocationName: route.fromLocationName, toLocationId, toLocationName: route.toLocationName,
      distanceKm: route.distanceKm,
      travelMinutes: window?.travelMinutes ?? route.defaultMinutes,
      source: window?.source ?? route.source,
      trafficRuleCode: window?.ruleCode ?? null,
    } satisfies TravelEstimate;
  };
  const timelineEndMinutes = timelineStartMinutes + TIMELINE_WINDOW_MINUTES;
  const visibleTimelineHours = useMemo(() => timelineHours(timelineStartMinutes), [timelineStartMinutes]);
  const showingToday = selectedDateIso === data.initialDate;
  const currentTimeInsideTimeline = showingToday && currentTimelineMinute >= timelineStartMinutes && currentTimelineMinute < timelineEndMinutes;
  const currentTimeLeft = currentTimeInsideTimeline
    ? `${((currentTimelineMinute - timelineStartMinutes) / TIMELINE_WINDOW_MINUTES) * 100}%`
    : null;
  const snapshotTimeInsideTimeline =
    snapshotMinute !== null && snapshotMinute >= timelineStartMinutes && snapshotMinute < timelineEndMinutes;
  const snapshotTimeLeft = snapshotTimeInsideTimeline
    ? `${((snapshotMinute! - timelineStartMinutes) / TIMELINE_WINDOW_MINUTES) * 100}%`
    : null;

  useEffect(() => {
    if (showingToday) {
      const minute = currentMinuteOfDay();
      setCurrentTimelineMinute(minute);
      setTimelineStartMinutes(timelineStartForCurrentMinute(minute));
      setTimelineFollowNow(true);
    } else {
      setTimelineStartMinutes(TIMELINE_DEFAULT_START_MINUTES);
      setTimelineFollowNow(false);
    }
  }, [showingToday, selectedDateIso]);

  useEffect(() => {
    const refreshClock = () => {
      const minute = currentMinuteOfDay();
      setCurrentTimelineMinute(minute);
      if (timelineFollowNow && showingToday) {
        setTimelineStartMinutes(timelineStartForCurrentMinute(minute));
      }
    };

    refreshClock();
    const timer = window.setInterval(refreshClock, 60_000);
    return () => window.clearInterval(timer);
  }, [timelineFollowNow, showingToday]);

  const moveTimeline = (direction: -1 | 1) => {
    setTimelineFollowNow(false);
    setTimelineStartMinutes((current) => clampTimelineStart(current + direction * TIMELINE_STEP_MINUTES));
  };

  const followCurrentTime = () => {
    const minute = currentMinuteOfDay();
    setCurrentTimelineMinute(minute);
    setTimelineStartMinutes(timelineStartForCurrentMinute(minute));
    setTimelineFollowNow(true);
  };

  const focusTimelineOnMinute = (minute: number | null) => {
    if (minute === null) return;
    setTimelineFollowNow(false);
    setTimelineStartMinutes(clampTimelineStart(Math.floor(minute / 60) * 60 - 2 * 60));
  };

  const plannedForSelectedDay = useMemo(
    () => activeWorkOrders.filter((work) => work.plannedDate === selectedDateIso),
    [activeWorkOrders, selectedDateIso],
  );

  const scheduledForSelectedDay = useMemo(
    () => plannedForSelectedDay.filter((work) => work.plannedStartMinutes !== null),
    [plannedForSelectedDay],
  );

  const visibleScheduledForSelectedDay = useMemo(
    () => scheduledForSelectedDay.filter((work) => isInsideVisibleTimeline(work.plannedStartMinutes, timelineStartMinutes, timelineEndMinutes)),
    [scheduledForSelectedDay, timelineEndMinutes, timelineStartMinutes],
  );

  const outsideTimelineForSelectedDay = useMemo(
    () => scheduledForSelectedDay.filter((work) => !isInsideVisibleTimeline(work.plannedStartMinutes, timelineStartMinutes, timelineEndMinutes)),
    [scheduledForSelectedDay, timelineEndMinutes, timelineStartMinutes],
  );

  const unscheduledForSelectedDay = useMemo(
    () => plannedForSelectedDay.filter((work) => work.plannedStartMinutes === null),
    [plannedForSelectedDay],
  );

  const selectedDayLabor = useMemo(
    () => [
      ...data.workOrders.flatMap((work) =>
        work.actualLabor
          .filter((entry) => sameLocalDay(entry.workDate, selectedDate))
          .map((entry) => ({
            ...entry,
            workId: work.id,
            workTitle: work.title,
            operationalLocationId: work.operationalLocationId,
          }))
      ),
      ...data.independentLabor
        .filter((entry) => sameLocalDay(entry.workDate, selectedDate))
        .map((entry) => ({
          ...entry,
          workId: null,
          workTitle: entry.description ?? t.diaryTimeSource,
        })),
    ],
    [data.independentLabor, data.workOrders, selectedDate, t.diaryTimeSource],
  );

  const timelineLabor = useMemo(
    () => selectedDayLabor.filter((entry) => entry.startedAt),
    [selectedDayLabor],
  );

  const activeEmployeeIds = useMemo(
    () => new Set(
      [
        ...data.workOrders.flatMap((work) =>
          work.actualLabor
            .filter((entry) => entry.startedAt && !entry.endedAt)
            .map((entry) => entry.employeeId),
        ),
        ...data.independentLabor
          .filter((entry) => entry.startedAt && !entry.endedAt)
          .map((entry) => entry.employeeId),
      ].filter((id): id is number => id !== null),
    ),
    [data.independentLabor, data.workOrders],
  );

  const personWorkRows = useMemo(() => {
    const rows = new Map<number, WorkOrderData[]>();

    for (const person of data.people) {
      const related = activeWorkOrders.filter((work) =>
        work.workParts.some((part) => part.assignedEmployeeIds.includes(person.id)),
      );
      rows.set(person.id, related);
    }

    return rows;
  }, [data.people, activeWorkOrders]);

  const currentAvailabilityByPersonId = useMemo(() => {
    const result = new Map<number, PersonAvailability>();
    for (const person of data.people) {
      const active = selectedDateIso === data.initialDate && activeEmployeeIds.has(person.id);
      const relatedWorks = personWorkRows.get(person.id) ?? [];
      const relatedWorksForDay = relatedWorks.filter((work) => work.plannedDate === selectedDateIso);
      result.set(person.id, active ? "working" : relatedWorksForDay.length > 0 ? "assigned" : "available");
    }
    return result;
  }, [activeEmployeeIds, data.initialDate, data.people, personWorkRows, selectedDateIso]);

  const snapshotByPersonId = useMemo(() => {
    const result = new Map<number, PersonSnapshot>();
    for (const person of data.people) {
      let snapshot: PersonSnapshot = { kind: "available", work: null };

      if (snapshotMinute !== null) {
        const actual = selectedDayLabor.find((entry) => {
          if (entry.employeeId !== person.id || !entry.startedAt) return false;
          const start = minuteOfDayFromIso(entry.startedAt);
          const end = entry.endedAt
            ? minuteOfDayFromIso(entry.endedAt)
            : entry.durationMinutes > 0
              ? start + entry.durationMinutes
              : 24 * 60;
          return snapshotMinute >= start && snapshotMinute < Math.max(start + 1, end);
        });

        if (actual) {
          snapshot = {
            kind: "actual",
            work: activeWorkOrders.find((work) => work.id === actual.workId) ?? data.workOrders.find((work) => work.id === actual.workId) ?? null,
          };
        } else {
          const planned = scheduledForSelectedDay.find((work) => {
            if (work.plannedStartMinutes === null) return false;
            if (!work.workParts.some((part) => part.assignedEmployeeIds.includes(person.id))) return false;
            const end = storedPlannedEndMinutes(work);
            return end !== null && snapshotMinute >= work.plannedStartMinutes && snapshotMinute < end;
          });
          if (planned) snapshot = { kind: "planned", work: planned };
        }
      }

      result.set(person.id, snapshot);
    }
    return result;
  }, [activeWorkOrders, data.people, data.workOrders, scheduledForSelectedDay, selectedDayLabor, snapshotMinute]);

  const personAvailabilityForFilter = (personId: number): PersonAvailability => {
    if (snapshotMinute !== null) {
      const snapshot = snapshotByPersonId.get(personId);
      if (snapshot?.kind === "actual") return "working";
      if (snapshot?.kind === "planned") return "assigned";
      return "available";
    }
    return currentAvailabilityByPersonId.get(personId) ?? "available";
  };

  const schedulePeople = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return data.people.filter((person) => {
      const availability = personAvailabilityForFilter(person.id);
      if (personStatusFilter !== "all" && availability !== personStatusFilter) return false;
      if (!q) return true;

      const personText = `${person.name} ${person.jobTitle ?? ""}`.toLocaleLowerCase();
      if (personText.includes(q)) return true;

      return (personWorkRows.get(person.id) ?? []).some((work) =>
        `${work.title} ${work.description ?? ""} ${work.address ?? ""} ${work.workNumber} ${work.workKey ?? ""}`
          .toLocaleLowerCase()
          .includes(q),
      );
    });
  }, [currentAvailabilityByPersonId, data.people, personStatusFilter, personWorkRows, search, snapshotByPersonId, snapshotMinute]);

  const peopleWindowStart = Math.max(0, Math.floor(peopleScrollTop / PEOPLE_ROW_HEIGHT) - PEOPLE_OVERSCAN);
  const peopleWindowCount = Math.ceil(PEOPLE_VIEWPORT_HEIGHT / PEOPLE_ROW_HEIGHT) + PEOPLE_OVERSCAN * 2;
  const peopleWindowEnd = Math.min(schedulePeople.length, peopleWindowStart + peopleWindowCount);
  const virtualPeople = schedulePeople.slice(peopleWindowStart, peopleWindowEnd);
  const peopleTopSpacer = peopleWindowStart * PEOPLE_ROW_HEIGHT;
  const peopleBottomSpacer = Math.max(0, (schedulePeople.length - peopleWindowEnd) * PEOPLE_ROW_HEIGHT);

  const scheduleStatusCounts = useMemo(() => {
    const counts = { all: data.people.length, available: 0, assigned: 0, working: 0 };
    for (const person of data.people) counts[personAvailabilityForFilter(person.id)] += 1;
    return counts;
  }, [currentAvailabilityByPersonId, data.people, snapshotByPersonId, snapshotMinute]);

  const syncPeopleScroll = (source: "list" | "timeline", event: UIEvent<HTMLDivElement>) => {
    const top = event.currentTarget.scrollTop;
    setPeopleScrollTop(top);
    const target = source === "list" ? peopleTimelineRef.current : peopleListRef.current;
    if (target && Math.abs(target.scrollTop - top) > 1) target.scrollTop = top;
  };

  const applySnapshot = () => {
    const minute = parseClockText(snapshotInput);
    if (minute === null) {
      setSnapshotMinute(null);
      return;
    }
    setSnapshotMinute(minute);
    setSnapshotInput(work10ClockFromMinutes(minute) ?? snapshotInput);
    focusTimelineOnMinute(minute);
  };

  const clearSnapshot = () => {
    setSnapshotMinute(null);
    setSnapshotInput("");
  };

  useEffect(() => {
    setPeopleScrollTop(0);
    if (peopleListRef.current) peopleListRef.current.scrollTop = 0;
    if (peopleTimelineRef.current) peopleTimelineRef.current.scrollTop = 0;
  }, [personStatusFilter, search, selectedDateIso, snapshotMinute]);

  const selectedPerson = data.people.find((person) => person.id === selectedPersonId) ?? null;

  const selectedPersonLabor = useMemo(() => {
    if (!selectedPersonId) return [];
    const workLabor = data.workOrders.flatMap((work) =>
      work.actualLabor
        .filter((entry) => entry.employeeId === selectedPersonId)
        .map((entry) => {
          const workPartTitle = entry.workPartId
            ? work.workParts.find((part) => part.source.kind === "WORK_PART" && Number(part.source.sourceId) === entry.workPartId)?.title ?? null
            : null;
          return { ...entry, workId: work.id as number | null, workTitle: work.title, workNumber: work.workNumber as string | null, workPartTitle };
        }),
    );
    const diaryLabor = data.independentLabor
      .filter((entry) => entry.employeeId === selectedPersonId)
      .map((entry) => ({
        ...entry,
        workId: null as number | null,
        workTitle: entry.description ?? t.diaryTimeSource,
        workNumber: entry.workKey ?? null,
        workPartTitle: null as string | null,
      }));

    return [...workLabor, ...diaryLabor]
      .filter((entry) => laborMatchesPeriod(entry.workDate, selectedDate, laborPeriod))
      .sort((a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime());
  }, [data.independentLabor, data.workOrders, laborPeriod, selectedDate, selectedPersonId, t.diaryTimeSource]);

  const selectedPersonLaborMinutes = selectedPersonLabor.reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);

  const selectedAssignedPeople = useMemo(() => {
    if (!selectedWork) return [];
    const ids = new Set(selectedWork.workParts.flatMap((part) => part.assignedEmployeeIds));
    return data.people.filter((person) => ids.has(person.id));
  }, [data.people, selectedWork]);

  const pairingCountForEmployees = (employeeAId: number, employeeBId: number) => {
    const a = Math.min(employeeAId, employeeBId);
    const b = Math.max(employeeAId, employeeBId);
    return pairingCountByKey.get(`${a}:${b}`) ?? 0;
  };

  const employeePairKey = (employeeAId: number, employeeBId: number) => {
    const a = Math.min(employeeAId, employeeBId);
    const b = Math.max(employeeAId, employeeBId);
    return `${a}:${b}`;
  };

  const candidateAvailabilityForWork = (
    personId: number,
    work: WorkOrderData,
    assumedMinute: number | null = null,
    context: StaffingSelectionContext = {},
  ): PersonAvailability => {
    const assignedHere = new Set(assignedEmployeeIdsForWork(work));
    if (assignedHere.has(personId)) return "assigned";

    const relatedElsewhere = (personWorkRows.get(personId) ?? []).filter((item) => item.id !== work.id);

    if (assumedMinute !== null) {
      const actual = (context.dayLabor ?? selectedDayLabor).find((entry) => {
        if (entry.employeeId !== personId || !entry.startedAt) return false;
        const start = minuteOfDayFromIso(entry.startedAt);
        const end = entry.endedAt
          ? minuteOfDayFromIso(entry.endedAt)
          : entry.durationMinutes > 0
            ? start + entry.durationMinutes
            : 24 * 60;
        return assumedMinute >= start && assumedMinute < Math.max(start + 1, end);
      });
      if (actual) return "working";

      const plannedConflict = (context.scheduledWorks ?? scheduledForSelectedDay).some((other) => {
        if (other.id === work.id || other.plannedStartMinutes === null) return false;
        if (!other.workParts.some((part) => part.assignedEmployeeIds.includes(personId))) return false;
        const end = storedPlannedEndMinutes(other);
        return end !== null && assumedMinute >= other.plannedStartMinutes && assumedMinute < end;
      });
      if (plannedConflict) return "assigned";

      const uncertainAssignment = relatedElsewhere.some((other) => !other.plannedDate || other.plannedStartMinutes === null);
      return uncertainAssignment ? "assigned" : "available";
    }

    const selectedHasTimedSlot = Boolean(
      work.plannedDate &&
      work.plannedStartMinutes !== null &&
      storedPlannedEndMinutes(work) !== null,
    );

    if (selectedHasTimedSlot) {
      const activeNowMatters = work.plannedDate === data.initialDate && activeEmployeeIds.has(personId);
      let hasConflict = false;
      let hasUncertainAssignment = false;

      for (const other of relatedElsewhere) {
        if (other.plannedDate && other.plannedDate !== work.plannedDate) continue;
        if (!other.plannedDate || other.plannedStartMinutes === null || storedPlannedEndMinutes(other) === null) {
          hasUncertainAssignment = true;
          continue;
        }
        if (work10ScheduleRangesOverlap({
          firstStart: work.plannedStartMinutes!,
          firstDuration: storedPlannedDurationMinutes(work)!,
          secondStart: other.plannedStartMinutes,
          secondDuration: storedPlannedDurationMinutes(other),
        })) hasConflict = true;
      }

      return activeNowMatters ? "working" : hasConflict || hasUncertainAssignment ? "assigned" : "available";
    }

    return activeEmployeeIds.has(personId)
      ? "working"
      : relatedElsewhere.length > 0
        ? "assigned"
        : "available";
  };

  const staffingRoleLabel = (roleCode: string) => {
    if (roleCode === "SPECIALIST") return t.staffingRoleSpecialist;
    if (roleCode === "ASSISTANT") return t.staffingRoleAssistant;
    if (roleCode === "DRIVER") return t.staffingRoleDriver;
    if (roleCode === "OPERATOR") return t.staffingRoleOperator;
    return t.staffingRoleGeneral;
  };

  const staffingCandidatesForPosition = (
    work: WorkOrderData,
    position: StaffingPosition,
    assumedMinute: number | null = null,
    context: StaffingSelectionContext = {},
  ): StaffingCandidate[] => {
    const assignedHere = new Set(assignedEmployeeIdsForWork(work));
    const resourceCodes = assignedResourcesForWork(work)
      .map((resource) => resource.qualificationCode)
      .filter((code): code is string => Boolean(code));
    const requiredCodes = uniqueQualificationCodes([
      ...position.requiredQualificationCodes,
      ...(position.roleCode === "ASSISTANT" ? [] : resourceCodes),
    ]);
    const preferredCodes = uniqueQualificationCodes(position.preferredQualificationCodes);
    const assignedTeamIds = new Set(
      work.workParts
        .flatMap((part) => part.assignedResources)
        .filter((resource) => resource.kind === "TEAM")
        .map((resource) => resource.id),
    );

    return data.people
      .filter((person) => !assignedHere.has(person.id))
      .filter((person) => !position.staffingRoleId || person.staffingRoleIds.includes(position.staffingRoleId))
      .filter((person) => departmentAllowsPerson(person, work))
      .filter((person) => workScopeMatchForPerson(person, position) !== "blocked")
      .map((person) => {
        const workScopeMatch = workScopeMatchForPerson(person, position) as WorkScopeMatch;
        const autoEligible = person.workExecutionMode !== "SELF_DIRECTED" && workScopeMatch !== "incidental_manual";
        const availability = candidateAvailabilityForWork(person.id, work, assumedMinute, context);
        const personCodes = new Set(person.qualificationCodes.map((code) => code.toUpperCase()));
        const matchedQualificationCodes = requiredCodes.filter((code) => personCodes.has(code));
        const missingQualificationCodes = requiredCodes.filter((code) => !personCodes.has(code));
        const preferredQualificationMatchCount = preferredCodes.filter((code) => personCodes.has(code)).length;
        let qualificationMatch: QualificationMatch = "unknown";
        if (requiredCodes.length > 0) {
          qualificationMatch = missingQualificationCodes.length === 0
            ? "matched"
            : matchedQualificationCodes.length > 0
              ? "partial"
              : "missing";
        }

        const pairingCount = [...assignedHere].reduce(
          (sum, employeeId) => sum + pairingCountForEmployees(person.id, employeeId),
          0,
        );
        const personTeamIds = teamIdsByEmployeeId.get(person.id) ?? new Set<number>();
        const teamMatchCount = [...assignedTeamIds].filter((teamId) => personTeamIds.has(teamId)).length;

        let score = 0;
        if (availability === "available") score += 120;
        else if (availability === "assigned") score -= 35;
        else score -= 90;

        if (qualificationMatch === "matched") score += 120;
        else if (qualificationMatch === "partial") score -= 120;
        else if (qualificationMatch === "missing") score -= 300;
        else score += 15;

        score += preferredQualificationMatchCount * 24;
        score += Math.min(48, pairingCount * 8);
        score += teamMatchCount * 25;

        if (workScopeMatch === "normal") score += 70;
        else if (workScopeMatch === "incidental_auto") score -= 90;
        else if (workScopeMatch === "incidental_manual") score -= 180;

        // Aðstoðarsæti eiga ekki að gleypa sjaldgæfa fagmenn að óþörfu.
        // Fagmaður má þó fara í aðstoð ef það er það besta sem er í boði.
        if (["ASSISTANT", "GENERAL"].includes(position.roleCode) && requiredCodes.length === 0) {
          score -= Math.min(30, person.qualificationCodes.length * 4);
        }
        if (
          ["SPECIALIST", "DRIVER", "OPERATOR"].includes(position.roleCode) &&
          /tækni|iðnað|vél|bílstjóri|lager|umsjón/i.test(person.jobTitle ?? "")
        ) {
          score += 10;
        }

        const reasons: string[] = [staffingRoleLabel(position.roleCode)];
        if (availability === "available") reasons.push(t.staffingReasonAvailable);
        else if (availability === "assigned") reasons.push(t.staffingReasonAssignedElsewhere);
        else reasons.push(t.staffingReasonWorking);
        if (qualificationMatch === "matched") reasons.push(t.staffingReasonQualificationMatch);
        else if (qualificationMatch === "partial") reasons.push(t.staffingReasonQualificationPartial);
        else if (qualificationMatch === "missing") reasons.push(t.staffingReasonQualificationMissing);
        else reasons.push(t.staffingReasonQualificationUnknown);
        if (preferredQualificationMatchCount > 0) reasons.push(`${t.staffingPreferredSkills}: ${preferredQualificationMatchCount}`);
        if (pairingCount > 0) reasons.push(`${t.staffingReasonPairing} ${pairingCount}×`);
        if (teamMatchCount > 0) reasons.push(t.staffingReasonTeam);
        if (work.responsibleDepartmentId && person.departmentId === work.responsibleDepartmentId) reasons.push(t.staffingReasonDepartment);
        if (workScopeMatch === "normal") reasons.push(t.staffingReasonWorkScope);
        else if (workScopeMatch === "incidental_auto") reasons.push(t.staffingReasonIncidentalAuto);
        else if (workScopeMatch === "incidental_manual") reasons.push(t.staffingReasonIncidentalManual);

        return {
          person,
          position,
          score,
          availability,
          qualificationMatch,
          matchedQualificationCodes,
          missingQualificationCodes,
          preferredQualificationMatchCount,
          pairingCount,
          teamMatchCount,
          fixedTeamMatchCount: 0,
          dayTeamContinuityCount: 0,
          workScopeMatch,
          autoEligible,
          travelEstimate: null,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));
  };

  const staffingCandidatesForWork = (
    work: WorkOrderData,
    assumedMinute: number | null = null,
    context: StaffingSelectionContext = {},
  ): StaffingCandidate[] => {
    const position = openStaffingPositionsForWork(work, data.people)[0];
    if (!position) return [];
    return staffingCandidatesForPosition(work, position, assumedMinute, context);
  };

  const selectSuggestedStaffingTeam = (
    work: WorkOrderData,
    assumedMinute: number | null = null,
    reservedEmployeeIds: Set<number> = new Set<number>(),
    context: StaffingSelectionContext = {},
  ) => {
    const positions = openStaffingPositionsForWork(work, data.people)
      .slice()
      .sort((a, b) => positionConstraintRank(a) - positionConstraintRank(b) || a.key.localeCompare(b.key));
    const selected: StaffingCandidate[] = [];
    const locallyReserved = new Set(reservedEmployeeIds);

    // Ef eitt fast teymi getur mannað allt fjölmennt Verk með fólki sem er
    // laust núna, innan venjulegs starfssviðs og uppfyllir allar harðar kröfur,
    // höldum við því teymi saman áður en einstaklingar úr ólíkum teymum eru blandaðir.
    // Þetta er hópregla, ekki bara punktabónus. Ef ekkert heilt fast teymi getur
    // fyllt öll sætin heldur hefðbundna einstaklingsröðunin áfram að gilda.
    const preferredFixedTeamEmployeeByPosition = new Map<string, number>();
    if (positions.length > 1) {
      const candidatesByPosition = new Map<string, StaffingCandidate[]>();
      for (const position of positions) {
        const options = staffingCandidatesForPosition(work, position, assumedMinute, context)
          .filter((candidate) =>
            candidate.qualificationMatch !== "missing" &&
            candidate.qualificationMatch !== "partial" &&
            candidate.autoEligible &&
            candidate.availability === "available" &&
            !locallyReserved.has(candidate.person.id) &&
            (!context.loadAllowedEmployeeIds || context.loadAllowedEmployeeIds.has(candidate.person.id)) &&
            (candidate.workScopeMatch === "normal" || candidate.workScopeMatch === "legacy"),
          )
          .filter((candidate) => {
            if (assumedMinute === null || !context.projectedLocationByEmployeeId || !work.operationalLocationId) return true;
            const fromLocationId = context.projectedLocationByEmployeeId.get(candidate.person.id) ?? candidate.person.baseOperationalLocationId;
            if (!fromLocationId || fromLocationId === work.operationalLocationId) return true;
            return travelEstimateFor(fromLocationId, work.operationalLocationId, assumedMinute, context.planningDateIso ?? selectedDateIso) !== null;
          });
        candidatesByPosition.set(position.key, options);
      }

      let commonTeamIds: Set<number> | null = null;
      for (const position of positions) {
        const teamIds = new Set<number>(
          (candidatesByPosition.get(position.key) ?? []).flatMap((candidate) => candidate.person.fixedTeamIds),
        );

        if (commonTeamIds === null) {
          commonTeamIds = teamIds;
          continue;
        }

        const intersection = new Set<number>();
        for (const teamId of commonTeamIds) {
          if (teamIds.has(teamId)) intersection.add(teamId);
        }
        commonTeamIds = intersection;
      }

      let bestTeamMatch: { teamId: number; score: number; employeeByPosition: Map<string, number> } | null = null;
      for (const teamId of commonTeamIds ?? []) {
        const searchTeamMatch = (
          positionIndex: number,
          usedEmployeeIds: Set<number>,
          score: number,
          employeeByPosition: Map<string, number>,
        ): { score: number; employeeByPosition: Map<string, number> } | null => {
          if (positionIndex >= positions.length) return { score, employeeByPosition };
          const position = positions[positionIndex];
          const options = (candidatesByPosition.get(position.key) ?? [])
            .filter((candidate) =>
              candidate.person.fixedTeamIds.includes(teamId) &&
              !usedEmployeeIds.has(candidate.person.id),
            )
            .map((candidate) => {
              const fromLocationId = context.projectedLocationByEmployeeId?.get(candidate.person.id) ?? candidate.person.baseOperationalLocationId;
              const travelEstimate = assumedMinute !== null
                ? travelEstimateFor(fromLocationId, work.operationalLocationId, assumedMinute, context.planningDateIso ?? selectedDateIso)
                : null;
              const travelScore = travelEstimate
                ? travelEstimate.travelMinutes === 0
                  ? SAME_LOCATION_BONUS
                  : -(travelEstimate.travelMinutes * TRAVEL_MINUTE_PENALTY + travelEstimate.distanceKm * TRAVEL_KM_PENALTY)
                : 0;
              const primaryTeamBonus = candidate.person.primaryFixedTeamId === teamId ? 20 : 0;
              const locationClusterBonus = context.locationPreferredEmployeeIds?.has(candidate.person.id)
                ? LOCATION_CLUSTER_EXISTING_BONUS
                : 0;
              const coverageBonus = Math.min(
                LOCATION_CLUSTER_COVERAGE_BONUS_CAP,
                Math.max(0, context.locationCoverageBonusByEmployeeId?.get(candidate.person.id) ?? 0),
              );
              const departurePenalty = Math.max(0, context.locationDeparturePenaltyByEmployeeId?.get(candidate.person.id) ?? 0);
              const loadAdjustment = context.loadScoreAdjustmentByEmployeeId?.get(candidate.person.id) ?? 0;
              return {
                candidate,
                matchScore: candidate.score + travelScore + primaryTeamBonus + locationClusterBonus + coverageBonus + loadAdjustment - departurePenalty,
              };
            })
            .sort((a, b) => b.matchScore - a.matchScore || a.candidate.person.name.localeCompare(b.candidate.person.name));

          let best: { score: number; employeeByPosition: Map<string, number> } | null = null;
          for (const option of options) {
            const nextUsed = new Set(usedEmployeeIds);
            nextUsed.add(option.candidate.person.id);
            const nextAssignment = new Map(employeeByPosition);
            nextAssignment.set(position.key, option.candidate.person.id);
            const result = searchTeamMatch(positionIndex + 1, nextUsed, score + option.matchScore, nextAssignment);
            if (result && (!best || result.score > best.score)) best = result;
          }
          return best;
        };

        const match = searchTeamMatch(0, new Set<number>(), 0, new Map<string, number>());
        if (match && (!bestTeamMatch || match.score > bestTeamMatch.score)) {
          bestTeamMatch = { teamId, score: match.score, employeeByPosition: match.employeeByPosition };
        }
      }

      if (bestTeamMatch) {
        for (const [positionKey, employeeId] of bestTeamMatch.employeeByPosition) {
          preferredFixedTeamEmployeeByPosition.set(positionKey, employeeId);
        }
      }
    }

    for (const position of positions) {
      const hardEligible = staffingCandidatesForPosition(work, position, assumedMinute, context)
        .filter((candidate) =>
          candidate.qualificationMatch !== "missing" &&
          candidate.qualificationMatch !== "partial" &&
          candidate.autoEligible,
        );

      const normalCandidates = hardEligible.filter((candidate) =>
        candidate.workScopeMatch === "normal" || candidate.workScopeMatch === "legacy",
      );
      const normalAvailableNow = normalCandidates.filter((candidate) =>
        candidate.availability === "available" &&
        !locallyReserved.has(candidate.person.id) &&
        (!context.loadAllowedEmployeeIds || context.loadAllowedEmployeeIds.has(candidate.person.id)),
      );

      const selectedIds = new Set(selected.map((candidate) => candidate.person.id));
      const selectedPositionKeys = new Set(selected.map((candidate) => candidate.position.key));
      const normalAvailableSoon = assumedMinute !== null && context.projectedAvailableAt
        ? normalCandidates.some((candidate) => {
            if (selectedIds.has(candidate.person.id)) return false;
            const availableAt = context.projectedAvailableAt?.get(candidate.person.id) ?? 24 * 60;
            if (availableAt <= assumedMinute || availableAt > assumedMinute + INCIDENTAL_AUTO_WAIT_MINUTES) return false;
            const fromLocationId = context.projectedLocationByEmployeeId?.get(candidate.person.id) ?? candidate.person.baseOperationalLocationId;
            const travel = travelEstimateFor(fromLocationId, work.operationalLocationId, availableAt, context.planningDateIso ?? selectedDateIso);
            if (fromLocationId && work.operationalLocationId && !travel) return false;
            return availableAt + (travel?.travelMinutes ?? 0) <= assumedMinute + INCIDENTAL_AUTO_WAIT_MINUTES;
          })
        : false;

      // AUTO_IF_NEEDED er raunveruleg varaleið. Ef starfsmaður innan venjulegs
      // starfssviðs er laus núna veljum við aðeins úr þeim hópi. Ef slíkur starfsmaður
      // losnar innan skamms bíður sjálfvirka dagsáætlunin frekar en að senda starfsmann
      // utan venjulegs starfssviðs. MANUAL_ONLY kemur aldrei inn sjálfkrafa.
      if (normalAvailableNow.length === 0 && normalAvailableSoon) return [] as StaffingCandidate[];

      const candidatePool = (normalAvailableNow.length > 0
        ? normalAvailableNow
        : hardEligible.filter((candidate) =>
            candidate.availability === "available" &&
            !locallyReserved.has(candidate.person.id) &&
            (!context.loadAllowedEmployeeIds || context.loadAllowedEmployeeIds.has(candidate.person.id)) &&
            candidate.workScopeMatch !== "incidental_manual",
          )).filter((candidate) => {
            if (assumedMinute === null || !context.projectedLocationByEmployeeId || !work.operationalLocationId) return true;
            const fromLocationId = context.projectedLocationByEmployeeId.get(candidate.person.id) ?? candidate.person.baseOperationalLocationId;
            if (!fromLocationId || fromLocationId === work.operationalLocationId) return true;
            return travelEstimateFor(fromLocationId, work.operationalLocationId, assumedMinute, context.planningDateIso ?? selectedDateIso) !== null;
          });

      const candidates = candidatePool.map((candidate) => {
        const historicalPairing = selected.reduce(
          (sum, item) => sum + pairingCountForEmployees(candidate.person.id, item.person.id),
          0,
        );
        const dayPairing = selected.reduce(
          (sum, item) => sum + (context.dayPairingCountByKey?.get(employeePairKey(candidate.person.id, item.person.id)) ?? 0),
          0,
        );
        const fixedTeamMatches = selected.reduce(
          (sum, item) => sum + sharedFixedTeamCount(candidate.person, item.person),
          0,
        );
        const candidateRecentTeammates = context.recentTeammatesByEmployeeId?.get(candidate.person.id) ?? new Set<number>();
        const recentTeamMatches = selected.reduce((sum, item) => {
          const itemRecentTeammates = context.recentTeammatesByEmployeeId?.get(item.person.id) ?? new Set<number>();
          return sum + (candidateRecentTeammates.has(item.person.id) || itemRecentTeammates.has(candidate.person.id) ? 1 : 0);
        }, 0);
        const remainingPositionCount = Math.max(0, positions.length - selected.length - 1);
        const recentTeamPotential = remainingPositionCount > 0
          ? [...candidateRecentTeammates].filter((teammateId) => {
              if (selectedIds.has(teammateId) || locallyReserved.has(teammateId)) return false;
              const teammate = data.people.find((person) => person.id === teammateId);
              if (!teammate) return false;
              const availableNow = context.projectedAvailableAt && assumedMinute !== null
                ? (context.projectedAvailableAt.get(teammateId) ?? 24 * 60) <= assumedMinute
                : candidateAvailabilityForWork(teammateId, work, assumedMinute, context) === "available";
              if (!availableNow) return false;
              return positions.some((otherPosition) => {
                if (otherPosition.key === position.key || selectedPositionKeys.has(otherPosition.key)) return false;
                const scopeMatch = workScopeMatchForPerson(teammate, otherPosition);
                return scopeMatch !== "blocked" &&
                  scopeMatch !== "incidental_manual" &&
                  (!otherPosition.staffingRoleId || teammate.staffingRoleIds.includes(otherPosition.staffingRoleId)) &&
                  otherPosition.requiredQualificationCodes.every((code) => teammate.qualificationCodes.map((item) => item.toUpperCase()).includes(code));
              });
            }).length
          : 0;
        const fixedTeamPotential = remainingPositionCount > 0
          ? data.people.filter((teammate) => {
              if (teammate.id === candidate.person.id || selectedIds.has(teammate.id) || locallyReserved.has(teammate.id)) return false;
              if (sharedFixedTeamCount(candidate.person, teammate) <= 0) return false;
              if (!departmentAllowsPerson(teammate, work)) return false;
              const availableNow = context.projectedAvailableAt && assumedMinute !== null
                ? (context.projectedAvailableAt.get(teammate.id) ?? 24 * 60) <= assumedMinute
                : candidateAvailabilityForWork(teammate.id, work, assumedMinute, context) === "available";
              if (!availableNow) return false;
              return positions.some((otherPosition) => {
                if (otherPosition.key === position.key || selectedPositionKeys.has(otherPosition.key)) return false;
                const scopeMatch = workScopeMatchForPerson(teammate, otherPosition);
                return scopeMatch !== "blocked" && scopeMatch !== "incidental_manual" &&
                  (!otherPosition.staffingRoleId || teammate.staffingRoleIds.includes(otherPosition.staffingRoleId)) &&
                  otherPosition.requiredQualificationCodes.every((code) => teammate.qualificationCodes.map((item) => item.toUpperCase()).includes(code));
              });
            }).length
          : 0;
        const continuityBonus = fixedTeamMatches * FIXED_TEAM_CONTINUITY_BONUS +
          Math.min(110, fixedTeamPotential * FIXED_TEAM_POTENTIAL_BONUS) +
          recentTeamMatches * RECENT_TEAM_CONTINUITY_BONUS +
          Math.min(DAY_PAIRING_BONUS_CAP, dayPairing * DAY_PAIRING_BONUS_PER_MATCH) +
          Math.min(90, recentTeamPotential * 45);
        const historicalPairingBonus = Math.min(60, historicalPairing * 10);
        const fromLocationId = context.projectedLocationByEmployeeId?.get(candidate.person.id) ?? candidate.person.baseOperationalLocationId;
        const travelEstimate = assumedMinute !== null
          ? travelEstimateFor(fromLocationId, work.operationalLocationId, assumedMinute, context.planningDateIso ?? selectedDateIso)
          : null;
        const travelScore = travelEstimate
          ? travelEstimate.travelMinutes === 0
            ? SAME_LOCATION_BONUS
            : -(travelEstimate.travelMinutes * TRAVEL_MINUTE_PENALTY + travelEstimate.distanceKm * TRAVEL_KM_PENALTY)
          : 0;

        const locationClusterBonus = context.locationPreferredEmployeeIds?.has(candidate.person.id)
          ? LOCATION_CLUSTER_EXISTING_BONUS
          : 0;
        const coverageBonus = Math.min(
          LOCATION_CLUSTER_COVERAGE_BONUS_CAP,
          Math.max(0, context.locationCoverageBonusByEmployeeId?.get(candidate.person.id) ?? 0),
        );
        const departurePenalty = Math.max(0, context.locationDeparturePenaltyByEmployeeId?.get(candidate.person.id) ?? 0);
        const loadAdjustment = context.loadScoreAdjustmentByEmployeeId?.get(candidate.person.id) ?? 0;

        return {
          ...candidate,
          score: candidate.score + historicalPairingBonus + continuityBonus + travelScore + locationClusterBonus + coverageBonus + loadAdjustment - departurePenalty,
          fixedTeamMatchCount: fixedTeamMatches,
          dayTeamContinuityCount: recentTeamMatches,
          travelEstimate,
        };
      });

      candidates.sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name));

      const preferredFixedTeamEmployeeId = preferredFixedTeamEmployeeByPosition.get(position.key) ?? null;
      const candidate = preferredFixedTeamEmployeeId !== null
        ? candidates.find((item) => item.person.id === preferredFixedTeamEmployeeId) ?? null
        : candidates[0] ?? null;
      if (!candidate) {
        // Ef harðri fagkröfu verður ekki mætt sendum við ekki aðstoðarmenn eina á staðinn.
        if (position.requiredQualificationCodes.length > 0) return [] as StaffingCandidate[];
        continue;
      }

      selected.push(candidate);
      locallyReserved.add(candidate.person.id);
    }

    return selected.map((candidate) => {
      const recentTeammates = context.recentTeammatesByEmployeeId?.get(candidate.person.id) ?? new Set<number>();
      const actualContinuityCount = selected.reduce((sum, other) => {
        if (other.person.id === candidate.person.id) return sum;
        const otherRecentTeammates = context.recentTeammatesByEmployeeId?.get(other.person.id) ?? new Set<number>();
        return sum + (recentTeammates.has(other.person.id) || otherRecentTeammates.has(candidate.person.id) ? 1 : 0);
      }, 0);
      const fixedTeamCount = selected.reduce((sum, other) => {
        if (other.person.id === candidate.person.id) return sum;
        return sum + sharedFixedTeamCount(candidate.person, other.person);
      }, 0);
      const reasons = candidate.reasons.filter((reason) => !reason.startsWith(t.staffingReasonDayTeam) && !reason.startsWith(t.staffingReasonFixedTeam));
      if (fixedTeamCount > 0) reasons.push(`${t.staffingReasonFixedTeam}${fixedTeamCount > 1 ? ` ×${fixedTeamCount}` : ""}`);
      if (actualContinuityCount > 0) reasons.push(`${t.staffingReasonDayTeam}${actualContinuityCount > 1 ? ` ×${actualContinuityCount}` : ""}`);
      return { ...candidate, fixedTeamMatchCount: fixedTeamCount, dayTeamContinuityCount: actualContinuityCount, reasons };
    });
  };

  const suggestedPeopleForSelectedWork = useMemo(() => {
    if (!selectedWork) return [];
    return staffingCandidatesForWork(selectedWork).filter((candidate) => candidate.availability === "available").slice(0, 5);
  }, [activeEmployeeIds, data.initialDate, data.people, pairingCountByKey, personWorkRows, selectedDayLabor, selectedWork, teamIdsByEmployeeId]);

  const staffingWork = staffingWorkId ? activeWorkOrders.find((work) => work.id === staffingWorkId) ?? null : null;
  const staffingCandidates = useMemo(() => {
    if (!staffingWork) return [];
    return staffingCandidatesForWork(staffingWork);
  }, [activeEmployeeIds, data.initialDate, data.people, pairingCountByKey, personWorkRows, selectedDayLabor, staffingWork, teamIdsByEmployeeId]);

  const staffingTeamSuggestion = useMemo(() => {
    if (!staffingWork) return [];
    return selectSuggestedStaffingTeam(staffingWork);
  }, [activeEmployeeIds, data.people, pairingCountByKey, personWorkRows, selectedDayLabor, staffingWork, teamIdsByEmployeeId]);

  const targetPartsForAssignments = (work: WorkOrderData, count: number) => {
    const openParts = work.workParts.filter((part) => !isTerminalPartStatus(part.status));
    if (openParts.length === 0) return [] as WorkPartData[];
    const remainingByPart = new Map(openParts.map((part) => [part.id, Math.max(0, part.requiredPeople - part.assignedEmployeeIds.length)]));
    const targets: WorkPartData[] = [];

    for (let index = 0; index < count; index += 1) {
      const target = openParts.find((part) => (remainingByPart.get(part.id) ?? 0) > 0) ?? openParts[0];
      targets.push(target);
      remainingByPart.set(target.id, Math.max(0, (remainingByPart.get(target.id) ?? 0) - 1));
    }
    return targets;
  };

  const persistAssignmentWithoutNavigation = async (employeeId: number, work: WorkOrderData, part: WorkPartData) => {
    const formData = new FormData();
    formData.set("workOrderId", String(work.id));
    formData.set("employeeId", String(employeeId));
    if (part.persistedInWork10 && part.source.kind === "WORK_PART") {
      formData.set("workPartId", part.source.sourceId);
      await assignPersonToWorkPart(formData);
    } else {
      formData.set("stayOnDashboard", "1");
      await persistLegacyFirstWorkPart(formData);
    }
  };

  const assignCandidatesToWork = async (work: WorkOrderData, candidates: StaffingCandidate[]) => {
    if (bulkAssignmentBusy || candidates.length === 0) return;
    const fallbackTargets = targetPartsForAssignments(work, candidates.length);
    if (fallbackTargets.length === 0) {
      setAssignmentFeedback({ kind: "error", text: t.noOpenPartForAssignment });
      return;
    }

    setBulkAssignmentBusy(true);
    setAssignmentFeedback(null);
    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const target = work.workParts.find((part) => part.id === candidate.position.partId)
          ?? fallbackTargets[index]
          ?? fallbackTargets[0];
        await persistAssignmentWithoutNavigation(candidate.person.id, work, target);
      }
      setAssignmentFeedback({ kind: "success", text: `${t.assignmentDropSuccess} · ${candidates.length}` });
      setStaffingWorkId(null);
      router.refresh();
    } catch (error) {
      setAssignmentFeedback({ kind: "error", text: error instanceof Error ? error.message : t.assignmentDropError });
    } finally {
      setBulkAssignmentBusy(false);
    }
  };

  const workdayProfileForPerson = (person: PersonData) =>
    data.workdayProfiles.find((profile) => profile.id === person.workplaceScheduleProfileId)
      ?? data.workdayProfiles.find((profile) => profile.isDefault)
      ?? null;

  const workdayBreaksForPerson = (person: PersonData) => {
    const workplace = workdayProfileForPerson(person);
    if (!workplace) return [];
    const agreement = data.laborAgreementProfiles.find((profile) => profile.id === person.laborAgreementProfileId) ?? null;
    return resolveWorkdayBreaks({
      workplaceBreaks: workplace.breaks,
      agreementBreaks: agreement?.breakRules ?? [],
      plannedShiftMinutes: workplace.standardWorkMinutes,
    });
  };

  const workdayEndForPerson = (person: PersonData) => {
    const workplace = workdayProfileForPerson(person);
    if (!workplace) return 16 * 60;
    return workplace.dayStartMinutes + Math.max(1, workplace.standardWorkMinutes);
  };

  const projectionAvailabilityEnd = (projection: { endMinutes: number; breaks: ProjectedBreak[] } | null) => {
    if (!projection) return null;
    return projection.breaks.reduce(
      (end, pause) => pause.mode === "AFTER_WORK"
        ? Math.max(end, pause.startMinutes + pause.durationMinutes)
        : end,
      projection.endMinutes,
    );
  };

  const plannedEndForWork = (work: WorkOrderData) => {
    if (work.plannedStartMinutes === null) return null;
    if (work.plannedEndMinutes !== null && work.plannedEndMinutes > work.plannedStartMinutes) return work.plannedEndMinutes;
    if (!work.estimatedMinutes || work.estimatedMinutes <= 0) return null;
    return work.plannedStartMinutes + Math.max(1, work.estimatedMinutes);
  };

  const dayLaborForDate = (dateIso: string): DayLaborEntry[] => {
    const date = dateFromIsoDate(dateIso);
    return [
      ...data.workOrders.flatMap((work) =>
        work.actualLabor
          .filter((entry) => sameLocalDay(entry.workDate, date))
          .map((entry) => ({
            ...entry,
            workId: work.id,
            workTitle: work.title,
            operationalLocationId: work.operationalLocationId,
          })),
      ),
      ...data.independentLabor
        .filter((entry) => sameLocalDay(entry.workDate, date))
        .map((entry) => ({
          ...entry,
          workId: null,
          workTitle: entry.description ?? t.diaryTimeSource,
        })),
    ];
  };

  const scheduledWorksForDate = (dateIso: string) => activeWorkOrders.filter(
    (work) => work.plannedDate === dateIso && work.plannedStartMinutes !== null,
  );

  const personAvailabilityAtMinuteForDay = (
    personId: number,
    minute: number,
    dateIso: string,
    dayLabor: DayLaborEntry[],
    scheduledWorks: WorkOrderData[],
  ): PersonAvailability => {
    const actual = dayLabor.find((entry) => {
      if (entry.employeeId !== personId || !entry.startedAt) return false;
      const start = minuteOfDayFromIso(entry.startedAt);
      const end = entry.endedAt
        ? minuteOfDayFromIso(entry.endedAt)
        : entry.durationMinutes > 0
          ? start + entry.durationMinutes
          : 24 * 60;
      return minute >= start && minute < Math.max(start + 1, end);
    });
    if (actual) return "working";

    const planned = scheduledWorks.some((work) => {
      if (work.plannedStartMinutes === null) return false;
      if (!work.workParts.some((part) => part.assignedEmployeeIds.includes(personId))) return false;
      const end = plannedEndForWork(work);
      return end !== null && minute >= work.plannedStartMinutes && minute < end;
    });
    if (planned) return "assigned";

    const uncertain = (personWorkRows.get(personId) ?? []).some((work) =>
      !work.plannedDate || (work.plannedDate === dateIso && work.plannedStartMinutes === null),
    );
    return uncertain ? "assigned" : "available";
  };

  const personAvailabilityAtMinute = (personId: number, minute: number): PersonAvailability =>
    personAvailabilityAtMinuteForDay(personId, minute, selectedDateIso, selectedDayLabor, scheduledForSelectedDay);

  const persistedWindowConflictForDay = (
    personId: number,
    workId: number,
    startMinutes: number,
    endMinutes: number,
    dayLabor: DayLaborEntry[],
    scheduledWorks: WorkOrderData[],
  ) => {
    const actualConflict = dayLabor.some((entry) => {
      if (entry.employeeId !== personId || !entry.startedAt) return false;
      const start = minuteOfDayFromIso(entry.startedAt);
      const end = entry.endedAt
        ? minuteOfDayFromIso(entry.endedAt)
        : entry.durationMinutes > 0
          ? start + entry.durationMinutes
          : 24 * 60;
      return startMinutes < end && start < endMinutes;
    });
    if (actualConflict) return true;

    return scheduledWorks.some((work) => {
      if (work.id === workId || work.plannedStartMinutes === null) return false;
      if (!work.workParts.some((part) => part.assignedEmployeeIds.includes(personId))) return false;
      const end = plannedEndForWork(work);
      return end !== null && startMinutes < end && work.plannedStartMinutes < endMinutes;
    });
  };

  const persistedWindowConflict = (personId: number, workId: number, startMinutes: number, endMinutes: number) =>
    persistedWindowConflictForDay(personId, workId, startMinutes, endMinutes, selectedDayLabor, scheduledForSelectedDay);

  const morningMinute = parseClockText(morningTimeInput) ?? 8 * 60;
  const worksNeedPeopleForDate = (dateIso: string, minute: number, excludedWorkIds: Set<number> = new Set<number>()) =>
    activeWorkOrders
      .filter((work) =>
        !excludedWorkIds.has(work.id) &&
        !work.readyToClose &&
        staffingDeficit(work, data.people) > 0 &&
        (!work.plannedDate || work.plannedDate === dateIso),
      )
      .slice()
      .sort((a, b) => {
        const priorityDiff = effectivePriorityRank(a, dateIso, minute) - effectivePriorityRank(b, dateIso, minute);
        if (priorityDiff !== 0) return priorityDiff;
        const aSlack = deadlineSlackMinutes(a, dateIso, minute);
        const bSlack = deadlineSlackMinutes(b, dateIso, minute);
        if (aSlack !== null || bSlack !== null) {
          const deadlineDiff = (aSlack ?? Number.MAX_SAFE_INTEGER) - (bSlack ?? Number.MAX_SAFE_INTEGER);
          if (deadlineDiff !== 0) return deadlineDiff;
        }
        const plannedDiff = plannedWorkSortValue(a) - plannedWorkSortValue(b);
        if (plannedDiff !== 0) return plannedDiff;
        const staffingDiff = staffingRank(a, data.people) - staffingRank(b, data.people);
        if (staffingDiff !== 0) return staffingDiff;
        return staffingDeficit(b, data.people) - staffingDeficit(a, data.people);
      });

  const morningWorksNeedPeople = useMemo(
    () => worksNeedPeopleForDate(selectedDateIso, morningMinute),
    [activeWorkOrders, data.people, morningMinute, selectedDateIso],
  );

  const morningUnassignedPeopleCount = useMemo(() =>
    data.people.filter((person) =>
      person.workExecutionMode !== "SELF_DIRECTED" &&
      personAvailabilityAtMinute(person.id, morningMinute) === "available"
    ).length,
    [data.people, morningMinute, personWorkRows, scheduledForSelectedDay, selectedDayLabor],
  );

  const buildMorningPlanForDate = (
    planningDateIso: string,
    excludedWorkIds: Set<number> = new Set<number>(),
  ): StaffingPlanBuildResult => {
    const startMinute = parseClockText(morningTimeInput);
    if (startMinute === null) return { plan: [], worksNeedPeople: [] };

    // Sjálfstæður vinnuhamur er skráður í Mobile Dagbók og á ekki að
    // fá sjálfvirka úthlutun. MIXED heldur áfram að vera fullgildur
    // kandídat í Dagsmönnun og getur jafnframt skráð Dagbók.
    const planningPeople = data.people.filter((person) => person.workExecutionMode !== "SELF_DIRECTED");
    const planningDayLabor = dayLaborForDate(planningDateIso);
    const planningScheduledWorks = scheduledWorksForDate(planningDateIso);
    const planningWorksNeedPeople = worksNeedPeopleForDate(planningDateIso, startMinute, excludedWorkIds);

    const candidateWorks = planningWorksNeedPeople.filter((work) =>
      work.estimatedMinutes !== null &&
      work.estimatedMinutes > 0 &&
      work.plannedStartMinutes === null &&
      staffingPartForWork(work)?.persistedInWork10,
    );
    const personAvailableAt = new Map<number, number>();
    const personTakenBreakCodes = new Map<number, Set<string>>();
    const personProjectedLocation = new Map<number, number | null>();
    const dayPairingCountByKey = new Map<string, number>();
    const recentTeammatesByEmployeeId = new Map<number, Set<number>>();
    const personPlanningCapacityMinutes = new Map<number, number>();
    const personPlannedWorkMinutes = new Map<number, number>();
    const personPlannedTravelMinutes = new Map<number, number>();
    for (const person of planningPeople) {
      const workplace = workdayProfileForPerson(person);
      const fullDayStart = workplace?.dayStartMinutes ?? 8 * 60;
      const fullDayEnd = workdayEndForPerson(person);
      const fullDayBreakMinutes = workdayBreaksForPerson(person)
        .filter((pause) => pause.targetStartMinutes >= fullDayStart && pause.targetStartMinutes < fullDayEnd)
        .reduce((sum, pause) => sum + pause.durationMinutes, 0);
      personPlanningCapacityMinutes.set(person.id, Math.max(1, fullDayEnd - fullDayStart - fullDayBreakMinutes));
      personPlannedWorkMinutes.set(person.id, 0);
      personPlannedTravelMinutes.set(person.id, 0);
      personAvailableAt.set(
        person.id,
        personAvailabilityAtMinuteForDay(person.id, startMinute, planningDateIso, planningDayLabor, planningScheduledWorks) === "available" ? startMinute : 24 * 60,
      );
      // Við endurskipulagningu um miðjan dag megum við ekki endurspila öll
      // neysluhlé sem áttu að vera tekin fyrr um daginn. Þar til raunveruleg
      // break-event gögn eru tengd inn teljum við reglubundin hlé fyrir
      // upphafspunkt endurskipulagningar þegar afgreidd.
      personTakenBreakCodes.set(
        person.id,
        new Set(
          workdayBreaksForPerson(person)
            .filter((pause) => pause.targetStartMinutes < startMinute)
            .map((pause) => pause.code),
        ),
      );

      let projectedLocationId = person.baseOperationalLocationId;
      let latestLocationMinute = -1;
      for (const entry of planningDayLabor) {
        if (entry.employeeId !== person.id || !entry.endedAt) continue;
        const endedMinute = minuteOfDayFromIso(entry.endedAt);
        if (endedMinute > startMinute || endedMinute <= latestLocationMinute) continue;
        const completedWork = entry.workId === null ? null : data.workOrders.find((work) => work.id === entry.workId);
        const actualLocationId = entry.operationalLocationId ?? completedWork?.operationalLocationId ?? null;
        if (!actualLocationId) continue;
        projectedLocationId = actualLocationId;
        latestLocationMinute = endedMinute;
      }
      for (const work of planningScheduledWorks) {
        if (!work.workParts.some((part) => part.assignedEmployeeIds.includes(person.id))) continue;
        const end = plannedEndForWork(work);
        if (end === null || end > startMinute || end <= latestLocationMinute || !work.operationalLocationId) continue;
        projectedLocationId = work.operationalLocationId;
        latestLocationMinute = end;
      }
      personProjectedLocation.set(person.id, projectedLocationId ?? null);
    }

    // Svæðisklösun: áður en fyrsta ferð er valin reiknum við hversu stóran hluta
    // af Verkpakkanum á hverjum rekstrarstað hver starfsmaður getur tekið innan
    // venjulegs starfssviðs. Þannig fær starfsmaður með breiðari hæfnisþekju forskot
    // þegar einn bíll/eitt teymi getur leyst fleiri Verk í sömu ferð.
    const locationCoverageBonusByLocationId = new Map<number, Map<number, number>>();
    const coverageStatsByLocationId = new Map<number, Map<number, {
      workIds: Set<number>;
      qualificationCodes: Set<string>;
      estimatedMinutes: number;
    }>>();

    for (const work of candidateWorks) {
      if (!work.operationalLocationId) continue;
      const positions = openStaffingPositionsForWork(work, data.people);
      if (positions.length === 0) continue;
      let byEmployee = coverageStatsByLocationId.get(work.operationalLocationId);
      if (!byEmployee) {
        byEmployee = new Map();
        coverageStatsByLocationId.set(work.operationalLocationId, byEmployee);
      }

      for (const person of planningPeople) {
        if (!departmentAllowsPerson(person, work)) continue;
        const matchingPositions = positions.filter((position) => {
          const scopeMatch = workScopeMatchForPerson(person, position);
          return (scopeMatch === "normal" || scopeMatch === "legacy") && personMatchesPosition(person, position);
        });
        if (matchingPositions.length === 0) continue;

        const stat = byEmployee.get(person.id) ?? {
          workIds: new Set<number>(),
          qualificationCodes: new Set<string>(),
          estimatedMinutes: 0,
        };
        if (!stat.workIds.has(work.id)) {
          stat.workIds.add(work.id);
          stat.estimatedMinutes += Math.max(0, work.estimatedMinutes ?? 0);
        }
        for (const position of matchingPositions) {
          position.requiredQualificationCodes.forEach((code) => stat.qualificationCodes.add(code.toUpperCase()));
        }
        byEmployee.set(person.id, stat);
      }
    }

    for (const [locationId, byEmployee] of coverageStatsByLocationId) {
      const bonuses = new Map<number, number>();
      for (const [employeeId, stat] of byEmployee) {
        const workCoverage = stat.workIds.size * 24;
        const skillBreadth = stat.qualificationCodes.size * 18;
        const usefulMinutes = Math.min(60, Math.round(stat.estimatedMinutes / 15));
        bonuses.set(employeeId, Math.min(LOCATION_CLUSTER_COVERAGE_BONUS_CAP, workCoverage + skillBreadth + usefulMinutes));
      }
      locationCoverageBonusByLocationId.set(locationId, bonuses);
    }

    const remainingCoverageWorkIdsByLocationId = new Map<number, Map<number, Set<number>>>();
    for (const [locationId, byEmployee] of coverageStatsByLocationId) {
      remainingCoverageWorkIdsByLocationId.set(
        locationId,
        new Map([...byEmployee].map(([employeeId, stat]) => [employeeId, new Set(stat.workIds)])),
      );
    }

    const plan: StaffingPlanItem[] = [];
    const plannedWorkIds = new Set<number>();
    const normalMaxShiftEnd = Math.min(
      24 * 60,
      Math.max(startMinute + 60, ...planningPeople.map((person) => workdayEndForPerson(person))),
    );
    const sameDayExceptionDeadlines = candidateWorks
      .filter((work) => work.allowAfterWorkdayEnd && work.completionDeadlineDate === planningDateIso && work.completionDeadlineMinutes !== null)
      .map((work) => work.completionDeadlineMinutes as number);
    const maxShiftEnd = Math.min(
      24 * 60,
      Math.max(
        normalMaxShiftEnd,
        candidateWorks.some((work) => work.allowAfterWorkdayEnd) ? normalMaxShiftEnd + 4 * 60 : normalMaxShiftEnd,
        ...sameDayExceptionDeadlines,
      ),
    );

    const returnProjectionFor = (person: PersonData, fromLocationId: number | null | undefined, departureMinutes: number) => {
      const baseLocationId = person.baseOperationalLocationId;
      if (!fromLocationId || !baseLocationId) return null;
      let departure = departureMinutes;
      let estimate = travelEstimateFor(fromLocationId, baseLocationId, departure, planningDateIso);
      if (!estimate) return null;
      const taken = personTakenBreakCodes.get(person.id) ?? new Set<string>();
      for (const pause of workdayBreaksForPerson(person)) {
        if (taken.has(pause.code)) continue;
        const arrival = departure + estimate.travelMinutes;
        if (pause.targetStartMinutes < departure || pause.targetStartMinutes >= arrival) continue;
        departure = Math.max(departure, pause.targetStartMinutes) + pause.durationMinutes;
        estimate = travelEstimateFor(fromLocationId, baseLocationId, departure, planningDateIso);
        if (!estimate) return null;
      }
      return { departureMinutes: departure, arrivalMinutes: departure + estimate.travelMinutes, estimate };
    };

    const projectedLoadForWork = (person: PersonData, work: WorkOrderData, dispatchMinute: number) => {
      const capacityMinutes = personPlanningCapacityMinutes.get(person.id) ?? 1;
      const maxUsedMinutes = Math.floor(capacityMinutes * (EMPLOYEE_LOAD_HARD_MAX_PERCENT / 100));
      const targetUsedMinutes = Math.floor(capacityMinutes * (EMPLOYEE_LOAD_TARGET_PERCENT / 100));
      const currentWorkMinutes = personPlannedWorkMinutes.get(person.id) ?? 0;
      const currentTravelMinutes = personPlannedTravelMinutes.get(person.id) ?? 0;
      const fromLocationId = personProjectedLocation.get(person.id) ?? person.baseOperationalLocationId;
      const outbound = travelEstimateFor(fromLocationId, work.operationalLocationId, dispatchMinute, planningDateIso);
      if (fromLocationId && work.operationalLocationId && !outbound) {
        return { allowed: false, projectedUsedMinutes: Number.MAX_SAFE_INTEGER, utilizationPercent: 100, scoreAdjustment: -1000 };
      }

      const workStartMinutes = roundUpToFiveMinutes(dispatchMinute + (outbound?.travelMinutes ?? 0));
      const projection = projectWorkWindowWithBreaks({
        startMinutes: workStartMinutes,
        workMinutes: Math.max(0, work.estimatedMinutes ?? 0),
        breaks: workdayBreaksForPerson(person),
        alreadyTakenBreakCodes: personTakenBreakCodes.get(person.id) ?? new Set<string>(),
      });
      const effectiveEnd = Math.max(projection.endMinutes, projectionAvailabilityEnd(projection) ?? projection.endMinutes);
      const returnProjection = work.operationalLocationId && person.baseOperationalLocationId
        ? returnProjectionFor(person, work.operationalLocationId, effectiveEnd)
        : null;
      const projectedUsedMinutes = currentWorkMinutes + currentTravelMinutes +
        Math.max(0, work.estimatedMinutes ?? 0) +
        (outbound?.travelMinutes ?? 0) +
        (returnProjection?.estimate.travelMinutes ?? 0);
      const utilizationPercent = capacityMinutes > 0 ? (projectedUsedMinutes / capacityMinutes) * 100 : 100;
      const allowed = projectedUsedMinutes <= maxUsedMinutes;

      // 85% er eðlilegt mark. Undir því fær starfsmaður hóflegt forskot,
      // en yfir markinu vex refsing hratt. 93% er hart þak og er aldrei
      // yfirstigið af sjálfvirku dagskipulagi. Svæðisklösun getur enn unnið
      // gegn þessari jöfnun ef hún sparar ferð, en aldrei farið yfir þakið.
      const scoreAdjustment = projectedUsedMinutes <= targetUsedMinutes
        ? Math.min(140, Math.round((targetUsedMinutes - projectedUsedMinutes) * 0.8))
        : -Math.min(420, Math.round((projectedUsedMinutes - targetUsedMinutes) * 8));

      return { allowed, projectedUsedMinutes, utilizationPercent, scoreAdjustment };
    };

    const suggestionFitsAtMinute = (work: WorkOrderData, suggestion: StaffingCandidate[], dispatchMinute: number) => {
      if (suggestion.length === 0 || !work.estimatedMinutes || work.estimatedMinutes <= 0) return false;
      const teamTravelMinutes = Math.max(0, ...suggestion.map((candidate) => candidate.travelEstimate?.travelMinutes ?? 0));
      const teamWorkStart = roundUpToFiveMinutes(dispatchMinute + teamTravelMinutes);
      if (teamWorkStart >= 24 * 60) return false;

      const projections = suggestion.map((candidate) => {
        const projection = projectWorkWindowWithBreaks({
          startMinutes: teamWorkStart,
          workMinutes: work.estimatedMinutes!,
          breaks: workdayBreaksForPerson(candidate.person),
          alreadyTakenBreakCodes: personTakenBreakCodes.get(candidate.person.id) ?? new Set<string>(),
        });
        return {
          candidate,
          projection,
          availabilityEnd: projectionAvailabilityEnd(projection) ?? projection.endMinutes,
        };
      });
      const teamWorkEnd = Math.max(...projections.map((item) => item.projection.endMinutes));
      const deadlineAbsolute = completionDeadlineAbsoluteMinutes(work);
      const teamWorkEndAbsolute = selectedAbsoluteMinutes(planningDateIso, teamWorkEnd);
      if (deadlineAbsolute !== null && teamWorkEndAbsolute !== null && teamWorkEndAbsolute > deadlineAbsolute) return false;

      return projections.every(({ candidate, availabilityEnd }) => {
        const loadProjection = projectedLoadForWork(candidate.person, work, dispatchMinute);
        if (!loadProjection.allowed) return false;
        const effectiveEnd = Math.max(teamWorkEnd, availabilityEnd);
        if (persistedWindowConflictForDay(candidate.person.id, work.id, dispatchMinute, effectiveEnd, planningDayLabor, planningScheduledWorks)) return false;
        const normalWorkdayEnd = workdayEndForPerson(candidate.person);
        const sameDayDeadline = work.completionDeadlineDate === planningDateIso && work.completionDeadlineMinutes !== null
          ? work.completionDeadlineMinutes
          : null;
        const exceptionEndLimit = Math.min(
          24 * 60,
          Math.max(normalWorkdayEnd + 4 * 60, sameDayDeadline ?? normalWorkdayEnd),
        );
        const requiredArrivalLimit = work.allowAfterWorkdayEnd ? exceptionEndLimit : normalWorkdayEnd;

        if (!work.operationalLocationId || !candidate.person.baseOperationalLocationId) {
          return effectiveEnd <= requiredArrivalLimit;
        }
        const returnProjection = returnProjectionFor(candidate.person, work.operationalLocationId, effectiveEnd);
        return Boolean(returnProjection && returnProjection.arrivalMinutes <= requiredArrivalLimit);
      });
    };

    const consumeIdleBreaks = (minute: number) => {
      for (const person of planningPeople) {
        const availableAt = personAvailableAt.get(person.id) ?? 24 * 60;
        if (availableAt > minute) continue;
        const taken = personTakenBreakCodes.get(person.id) ?? new Set<string>();
        for (const pause of workdayBreaksForPerson(person)) {
          if (taken.has(pause.code) || pause.targetStartMinutes > minute) continue;
          const pauseStart = Math.max(availableAt, pause.targetStartMinutes);
          const pauseEnd = pauseStart + pause.durationMinutes;
          taken.add(pause.code);
          personTakenBreakCodes.set(person.id, taken);
          if (pauseEnd > minute) personAvailableAt.set(person.id, pauseEnd);
        }
      }
    };

    const MAX_PLANNED_WORKS = 500;
    for (let minute = startMinute; minute < maxShiftEnd && plannedWorkIds.size < MAX_PLANNED_WORKS; minute += 5) {
      consumeIdleBreaks(minute);
      let scheduledAtThisMinute = true;

      while (scheduledAtThisMinute && plannedWorkIds.size < MAX_PLANNED_WORKS) {
        scheduledAtThisMinute = false;

        const projectedSchedulingRanks = (work: WorkOrderData) => {
          if (!work.operationalLocationId || !work.estimatedMinutes || work.estimatedMinutes <= 0) {
            return { travelRank: 10_000, packingRank: 100_000 };
          }

          const homewardPressure = Math.max(0, Math.min(1, (minute - 13 * 60) / (3 * 60)));
          const travelRanks: number[] = [];
          const packingRanks: number[] = [];

          for (const person of planningPeople) {
            if (!departmentAllowsPerson(person, work)) continue;
            if ((personAvailableAt.get(person.id) ?? 24 * 60) > minute) continue;
            const fromLocationId = personProjectedLocation.get(person.id) ?? person.baseOperationalLocationId;
            if (!fromLocationId) continue;
            const outbound = travelEstimateFor(fromLocationId, work.operationalLocationId, minute, planningDateIso);
            if (!outbound) continue;

            const projectedStart = roundUpToFiveMinutes(minute + outbound.travelMinutes);
            const projection = projectWorkWindowWithBreaks({
              startMinutes: projectedStart,
              workMinutes: work.estimatedMinutes,
              breaks: workdayBreaksForPerson(person),
              alreadyTakenBreakCodes: personTakenBreakCodes.get(person.id) ?? new Set<string>(),
            });
            const projectedEnd = Math.max(
              projection.endMinutes,
              projectionAvailabilityEnd(projection) ?? projection.endMinutes,
            );
            const returnProjection = returnProjectionFor(person, work.operationalLocationId, projectedEnd);
            const normalEnd = workdayEndForPerson(person);
            const returnTravelMinutes = returnProjection?.estimate.travelMinutes ?? 0;
            const arrivalAtBase = returnProjection?.arrivalMinutes ?? projectedEnd;
            const totalTravelMinutes = outbound.travelMinutes + returnTravelMinutes;

            travelRanks.push(outbound.travelMinutes + returnTravelMinutes * homewardPressure);

            // Gluggapökkun: lægra gildi er betra. Verk sem fyllir laust rými vel
            // fær forskot, en akstur er refsiverður svo við fyllum ekki daginn
            // með ferðatíma í stað raunvinnu.
            if (arrivalAtBase <= normalEnd) {
              const unusedNormalMinutes = Math.max(0, normalEnd - arrivalAtBase);
              packingRanks.push(unusedNormalMinutes + totalTravelMinutes * 2);
              continue;
            }

            if (work.allowAfterWorkdayEnd) {
              const sameDayDeadline = work.completionDeadlineDate === planningDateIso && work.completionDeadlineMinutes !== null
                ? work.completionDeadlineMinutes
                : null;
              const exceptionEndLimit = Math.min(
                24 * 60,
                Math.max(normalEnd + 4 * 60, sameDayDeadline ?? normalEnd),
              );
              if (arrivalAtBase <= exceptionEndLimit) {
                const overtimeMinutes = Math.max(0, arrivalAtBase - normalEnd);
                // Yfirvinna er undantekning og kemur því á eftir Verkefnum sem
                // passa innan venjulegs dags nema forgangur/deadline krefjist annars.
                packingRanks.push(10_000 + overtimeMinutes * 20 + totalTravelMinutes * 2);
              }
            }
          }

          return {
            travelRank: travelRanks.length > 0 ? Math.min(...travelRanks) : 10_000,
            packingRank: packingRanks.length > 0 ? Math.min(...packingRanks) : 100_000,
          };
        };
        const availableCandidateWorks = candidateWorks
          .filter((work) => !plannedWorkIds.has(work.id) && blockedResourcesForWork(work).length === 0);
        const schedulingRankByWorkId = new Map<number, { travelRank: number; packingRank: number }>(
          availableCandidateWorks.map((work) => [work.id, projectedSchedulingRanks(work)]),
        );
        const orderedCandidateWorks = availableCandidateWorks
          .slice()
          .sort((a, b) => {
            const priorityDiff = effectivePriorityRank(a, planningDateIso, minute) - effectivePriorityRank(b, planningDateIso, minute);
            if (priorityDiff !== 0) return priorityDiff;

            const pressureDiff = deadlinePressureRank(a, planningDateIso, minute) - deadlinePressureRank(b, planningDateIso, minute);
            if (pressureDiff !== 0) return pressureDiff;

            const aSlack = deadlineSlackMinutes(a, planningDateIso, minute);
            const bSlack = deadlineSlackMinutes(b, planningDateIso, minute);
            const aPressure = deadlinePressureRank(a, planningDateIso, minute);
            const bPressure = deadlinePressureRank(b, planningDateIso, minute);
            if (aPressure <= 1 || bPressure <= 1) {
              const deadlineDiff = (aSlack ?? Number.MAX_SAFE_INTEGER) - (bSlack ?? Number.MAX_SAFE_INTEGER);
              if (deadlineDiff !== 0) return deadlineDiff;
            }

            const packingDiff = (schedulingRankByWorkId.get(a.id)?.packingRank ?? 100_000)
              - (schedulingRankByWorkId.get(b.id)?.packingRank ?? 100_000);
            if (packingDiff !== 0) return packingDiff;

            const staffingDiff = staffingRank(a, data.people) - staffingRank(b, data.people);
            if (staffingDiff !== 0) return staffingDiff;
            const travelDiff = (schedulingRankByWorkId.get(a.id)?.travelRank ?? 10_000)
              - (schedulingRankByWorkId.get(b.id)?.travelRank ?? 10_000);
            if (travelDiff !== 0) return travelDiff;

            if (aSlack !== null || bSlack !== null) {
              const deadlineDiff = (aSlack ?? Number.MAX_SAFE_INTEGER) - (bSlack ?? Number.MAX_SAFE_INTEGER);
              if (deadlineDiff !== 0) return deadlineDiff;
            }
            return staffingDeficit(b, data.people) - staffingDeficit(a, data.people);
          });

        for (const work of orderedCandidateWorks) {
          const openPositions = openStaffingPositionsForWork(work, data.people);
          if (openPositions.length === 0) continue;

          const reserved = new Set<number>(
            planningPeople
              .filter((person) => (personAvailableAt.get(person.id) ?? 24 * 60) > minute)
              .map((person) => person.id),
          );
          const locationPreferredEmployeeIds = work.operationalLocationId
            ? new Set<number>(
                planningPeople
                  .filter((person) => (personProjectedLocation.get(person.id) ?? person.baseOperationalLocationId) === work.operationalLocationId)
                  .map((person) => person.id),
              )
            : new Set<number>();
          const locationCoverageBonusByEmployeeId = work.operationalLocationId
            ? locationCoverageBonusByLocationId.get(work.operationalLocationId) ?? new Map<number, number>()
            : new Map<number, number>();
          const locationDeparturePenaltyByEmployeeId = new Map<number, number>();
          if (work.operationalLocationId) {
            for (const person of planningPeople) {
              const currentLocationId = personProjectedLocation.get(person.id) ?? person.baseOperationalLocationId;
              if (!currentLocationId || currentLocationId === work.operationalLocationId || currentLocationId === person.baseOperationalLocationId) continue;
              const remainingHere = remainingCoverageWorkIdsByLocationId.get(currentLocationId)?.get(person.id)?.size ?? 0;
              if (remainingHere <= 0) continue;
              locationDeparturePenaltyByEmployeeId.set(
                person.id,
                LOCATION_CLUSTER_DEPARTURE_PENALTY + Math.min(210, remainingHere * LOCATION_CLUSTER_DEPARTURE_EXTRA_PER_WORK),
              );
            }
          }
          const loadAllowedEmployeeIds = new Set<number>();
          const loadScoreAdjustmentByEmployeeId = new Map<number, number>();
          for (const person of planningPeople) {
            const loadProjection = projectedLoadForWork(person, work, minute);
            if (loadProjection.allowed) loadAllowedEmployeeIds.add(person.id);
            loadScoreAdjustmentByEmployeeId.set(person.id, loadProjection.scoreAdjustment);
          }

          const selectionContext: StaffingSelectionContext = {
            projectedAvailableAt: personAvailableAt,
            dayPairingCountByKey,
            recentTeammatesByEmployeeId,
            projectedLocationByEmployeeId: personProjectedLocation,
            locationPreferredEmployeeIds,
            locationCoverageBonusByEmployeeId,
            locationDeparturePenaltyByEmployeeId,
            loadAllowedEmployeeIds,
            loadScoreAdjustmentByEmployeeId,
            planningDateIso,
            dayLabor: planningDayLabor,
            scheduledWorks: planningScheduledWorks,
          };

          // Ef fólk er þegar komið á svæðið reynum við fyrst að manna næsta Verk
          // alfarið með því fólki. Þetta kemur í veg fyrir að annað teymi/bíll sé
          // sent sömu löngu leið meðan hæft fólk er þegar á staðnum.
          let suggestion: StaffingCandidate[] = [];
          if (locationPreferredEmployeeIds.size > 0) {
            const anchorReserved = new Set<number>(reserved);
            for (const person of planningPeople) {
              if (!locationPreferredEmployeeIds.has(person.id)) anchorReserved.add(person.id);
            }
            const anchorSuggestion = selectSuggestedStaffingTeam(work, minute, anchorReserved, selectionContext);
            if (anchorSuggestion.length === openPositions.length) suggestion = anchorSuggestion;
          }
          if (suggestion.length !== openPositions.length) {
            suggestion = selectSuggestedStaffingTeam(work, minute, reserved, selectionContext);
          }
          if (suggestion.length !== openPositions.length) continue;

          const newDispatchTravelMinutes = Math.max(0, ...suggestion.map((candidate) => candidate.travelEstimate?.travelMinutes ?? 0));
          const reusesOnlyPeopleOnLocation = suggestion.every((candidate) => locationPreferredEmployeeIds.has(candidate.person.id));

          // Ef tillagan myndi senda nýjan bíl/teymi langt inn á svæði þar sem
          // hæft fólk er þegar statt reynum við frekar að bíða eftir því fólki.
          // Hlé á svæðinu telst eðlilegur hluti dagsins og er tekið með í
          // suggestionFitsAtMinute; við sendum ekki annað teymi bara vegna kaffis.
          if (
            work.operationalLocationId &&
            locationPreferredEmployeeIds.size > 0 &&
            !reusesOnlyPeopleOnLocation &&
            newDispatchTravelMinutes >= LOCATION_CLUSTER_NEW_DISPATCH_MINUTES
          ) {
            const futureAnchorMinutes = [...locationPreferredEmployeeIds]
              .map((employeeId) => personAvailableAt.get(employeeId) ?? 24 * 60)
              .filter((availableAt) => availableAt > minute && availableAt <= Math.min(maxShiftEnd, minute + LOCATION_CLUSTER_WAIT_MAX_MINUTES))
              .sort((a, b) => a - b)
              .filter((availableAt, index, values) => index === 0 || availableAt !== values[index - 1]);

            let canWaitForExistingLocationTeam = false;
            for (const readyMinute of futureAnchorMinutes) {
              const futureReserved = new Set<number>();
              for (const person of planningPeople) {
                const isAnchor = locationPreferredEmployeeIds.has(person.id);
                const availableAt = personAvailableAt.get(person.id) ?? 24 * 60;
                if (!isAnchor || availableAt > readyMinute) futureReserved.add(person.id);
              }
              const futureSuggestion = selectSuggestedStaffingTeam(work, readyMinute, futureReserved, selectionContext);
              if (futureSuggestion.length !== openPositions.length) continue;
              if (!futureSuggestion.every((candidate) => candidate.workScopeMatch === "normal" || candidate.workScopeMatch === "legacy")) continue;
              if (!suggestionFitsAtMinute(work, futureSuggestion, readyMinute)) continue;
              canWaitForExistingLocationTeam = true;
              break;
            }
            if (canWaitForExistingLocationTeam) continue;

            // Ef svæðisteymið hefur rétta hæfni en kemst ekki yfir Verkið í dag
            // og deadline krefst þess ekki í dag, látum við Verkið bíða frekar en
            // að stofna aðra langa ferð. Brýnt Verk fær þó alltaf að reyna nýja ferð.
            const potentialReserved = new Set<number>(
              planningPeople
                .filter((person) => !locationPreferredEmployeeIds.has(person.id))
                .map((person) => person.id),
            );
            const anchorPotential = selectSuggestedStaffingTeam(work, minute, potentialReserved, selectionContext);
            const anchorCanCoverAllPositions = anchorPotential.length === openPositions.length &&
              anchorPotential.every((candidate) => candidate.workScopeMatch === "normal" || candidate.workScopeMatch === "legacy");
            const deadlineDay = work.completionDeadlineDate ? isoDateOrdinal(work.completionDeadlineDate) : null;
            const selectedDay = isoDateOrdinal(planningDateIso);
            const deadlineRequiresToday = deadlineDay !== null && selectedDay !== null && deadlineDay <= selectedDay;
            if (anchorCanCoverAllPositions && !deadlineRequiresToday && work.priority !== "URGENT") continue;
          }

          const travelCrossesUntakenBreak = suggestion.some((candidate) => {
            const travelMinutes = candidate.travelEstimate?.travelMinutes ?? 0;
            if (travelMinutes <= 0) return false;
            const taken = personTakenBreakCodes.get(candidate.person.id) ?? new Set<string>();
            return workdayBreaksForPerson(candidate.person).some((pause) =>
              !taken.has(pause.code) && pause.targetStartMinutes >= minute && pause.targetStartMinutes < minute + travelMinutes,
            );
          });
          // Ekki keyra yfir fyrirfram skilgreint neysluhlé. Lykkjan reynir aftur
          // eftir að consumeIdleBreaks hefur sett viðkomandi hlé inn í daginn.
          if (travelCrossesUntakenBreak) continue;

          const teamTravelMinutes = Math.max(0, ...suggestion.map((candidate) => candidate.travelEstimate?.travelMinutes ?? 0));
          const teamWorkStart = roundUpToFiveMinutes(minute + teamTravelMinutes);
          if (teamWorkStart >= 24 * 60) continue;

          const candidateProjections = suggestion.map((candidate) => {
            const takenCodes = personTakenBreakCodes.get(candidate.person.id) ?? new Set<string>();
            const projection = projectWorkWindowWithBreaks({
              startMinutes: teamWorkStart,
              workMinutes: work.estimatedMinutes!,
              breaks: workdayBreaksForPerson(candidate.person),
              alreadyTakenBreakCodes: takenCodes,
            });
            return {
              candidate,
              projection,
              availabilityEnd: projectionAvailabilityEnd(projection) ?? projection.endMinutes,
            };
          });

          const teamWorkEnd = Math.max(...candidateProjections.map((item) => item.projection.endMinutes));
          const deadlineAbsolute = completionDeadlineAbsoluteMinutes(work);
          const teamWorkEndAbsolute = selectedAbsoluteMinutes(planningDateIso, teamWorkEnd);
          if (deadlineAbsolute !== null && teamWorkEndAbsolute !== null && teamWorkEndAbsolute > deadlineAbsolute) continue;

          const fits = candidateProjections.every(({ candidate, availabilityEnd }) => {
            const loadProjection = projectedLoadForWork(candidate.person, work, minute);
            if (!loadProjection.allowed) return false;
            const effectiveEnd = Math.max(teamWorkEnd, availabilityEnd);
            if (persistedWindowConflictForDay(candidate.person.id, work.id, minute, effectiveEnd, planningDayLabor, planningScheduledWorks)) return false;

            const normalWorkdayEnd = workdayEndForPerson(candidate.person);
            const sameDayDeadline = work.completionDeadlineDate === planningDateIso && work.completionDeadlineMinutes !== null
              ? work.completionDeadlineMinutes
              : null;
            const exceptionEndLimit = Math.min(
              24 * 60,
              Math.max(normalWorkdayEnd + 4 * 60, sameDayDeadline ?? normalWorkdayEnd),
            );
            const requiredArrivalLimit = work.allowAfterWorkdayEnd ? exceptionEndLimit : normalWorkdayEnd;

            if (!work.operationalLocationId || !candidate.person.baseOperationalLocationId) {
              return effectiveEnd <= requiredArrivalLimit;
            }
            const returnProjection = returnProjectionFor(candidate.person, work.operationalLocationId, effectiveEnd);
            return Boolean(returnProjection && returnProjection.arrivalMinutes <= requiredArrivalLimit);
          });
          if (!fits) continue;

          for (const { candidate, projection, availabilityEnd } of candidateProjections) {
            const effectiveAvailabilityEnd = Math.max(teamWorkEnd, availabilityEnd);
            personPlannedWorkMinutes.set(
              candidate.person.id,
              (personPlannedWorkMinutes.get(candidate.person.id) ?? 0) + Math.max(0, work.estimatedMinutes ?? 0),
            );
            personPlannedTravelMinutes.set(
              candidate.person.id,
              (personPlannedTravelMinutes.get(candidate.person.id) ?? 0) + Math.max(0, candidate.travelEstimate?.travelMinutes ?? 0),
            );
            personAvailableAt.set(candidate.person.id, effectiveAvailabilityEnd);
            if (work.operationalLocationId) personProjectedLocation.set(candidate.person.id, work.operationalLocationId);
            const taken = personTakenBreakCodes.get(candidate.person.id) ?? new Set<string>();
            projection.breaks.forEach((pause) => taken.add(pause.code));
            personTakenBreakCodes.set(candidate.person.id, taken);
            const travel = candidate.travelEstimate;
            plan.push({
              workId: work.id,
              employeeId: candidate.person.id,
              score: candidate.score,
              targetPartId: candidate.position.partId,
              roleCode: candidate.position.roleCode,
              requiredQualificationCodes: candidate.position.requiredQualificationCodes,
              plannedStartMinutes: teamWorkStart,
              projectedEndMinutes: teamWorkEnd,
              projectedAvailableMinutes: effectiveAvailabilityEnd,
              projectedBreaks: projection.breaks,
              fixedTeamMatchCount: candidate.fixedTeamMatchCount,
              dayTeamContinuityCount: candidate.dayTeamContinuityCount,
              workScopeMatch: candidate.workScopeMatch,
              travelFromLocationId: travel?.fromLocationId ?? null,
              travelFromLocationName: travel?.fromLocationName ?? null,
              travelToLocationId: travel?.toLocationId ?? work.operationalLocationId ?? null,
              travelToLocationName: travel?.toLocationName ?? work.operationalLocationName ?? null,
              travelDepartureMinutes: travel ? minute : null,
              travelMinutes: travel?.travelMinutes ?? 0,
              travelDistanceKm: travel?.distanceKm ?? 0,
              travelSource: travel?.source ?? null,
              trafficRuleCode: travel?.trafficRuleCode ?? null,
              returnFromLocationId: null,
              returnFromLocationName: null,
              returnToLocationId: null,
              returnToLocationName: null,
              returnDepartureMinutes: null,
              returnMinutes: 0,
              returnDistanceKm: 0,
              returnSource: null,
              returnTrafficRuleCode: null,
            });
          }

          const plannedTeamIds = candidateProjections.map(({ candidate }) => candidate.person.id);
          if (plannedTeamIds.length > 1) {
            for (let left = 0; left < plannedTeamIds.length; left += 1) {
              const employeeId = plannedTeamIds[left];
              recentTeammatesByEmployeeId.set(
                employeeId,
                new Set(plannedTeamIds.filter((candidateId) => candidateId !== employeeId)),
              );
              for (let right = left + 1; right < plannedTeamIds.length; right += 1) {
                const key = employeePairKey(employeeId, plannedTeamIds[right]);
                dayPairingCountByKey.set(key, (dayPairingCountByKey.get(key) ?? 0) + 1);
              }
            }
          }

          plannedWorkIds.add(work.id);
          if (work.operationalLocationId) {
            const remainingByEmployee = remainingCoverageWorkIdsByLocationId.get(work.operationalLocationId);
            if (remainingByEmployee) {
              for (const workIds of remainingByEmployee.values()) workIds.delete(work.id);
            }
          }
          scheduledAtThisMinute = true;
        }
      }
    }

    const lastPlanIndexByEmployee = new Map<number, number>();
    for (let index = 0; index < plan.length; index += 1) {
      const item = plan[index];
      const previousIndex = lastPlanIndexByEmployee.get(item.employeeId);
      if (previousIndex === undefined || (plan[previousIndex].projectedAvailableMinutes ?? -1) <= (item.projectedAvailableMinutes ?? -1)) {
        lastPlanIndexByEmployee.set(item.employeeId, index);
      }
    }
    for (const [employeeId, index] of lastPlanIndexByEmployee) {
      const item = plan[index];
      const person = planningPeople.find((candidate) => candidate.id === employeeId);
      const work = activeWorkOrders.find((candidate) => candidate.id === item.workId);
      if (!person || !work?.operationalLocationId || !person.baseOperationalLocationId || item.projectedAvailableMinutes === null) continue;
      const returnProjection = returnProjectionFor(person, work.operationalLocationId, item.projectedAvailableMinutes);
      if (!returnProjection) continue;
      item.returnFromLocationId = returnProjection.estimate.fromLocationId;
      item.returnFromLocationName = returnProjection.estimate.fromLocationName;
      item.returnToLocationId = returnProjection.estimate.toLocationId;
      item.returnToLocationName = returnProjection.estimate.toLocationName;
      item.returnDepartureMinutes = returnProjection.departureMinutes;
      item.returnMinutes = returnProjection.estimate.travelMinutes;
      item.returnDistanceKm = returnProjection.estimate.distanceKm;
      item.returnSource = returnProjection.estimate.source;
      item.returnTrafficRuleCode = returnProjection.estimate.trafficRuleCode;
    }

    return { plan, worksNeedPeople: planningWorksNeedPeople };
  };

  const generateMorningPlan = () => {
    const result = buildMorningPlanForDate(selectedDateIso);
    setMorningPlan(result.plan);
    setMorningStaffingOpen(true);
  };

  const generatePeriodPlan = async () => {
    if (periodPlanningBusy) return;
    const parsedDays = Number.parseInt(periodDaysInput, 10);
    const dayCount = Number.isFinite(parsedDays) ? Math.max(1, Math.min(31, parsedDays)) : 5;
    setPeriodDaysInput(String(dayCount));
    setPeriodPlanningBusy(true);
    setPeriodPlanningCompletedDays(0);
    setPeriodPlanningTotalDays(dayCount);
    setPeriodDetailDateIso(null);
    setPeriodPlan([]);
    setPeriodStaffingOpen(true);

    // Leyfum React/vafranum að mála framvinduna áður en fyrsti dagurinn er reiknaður.
    await yieldToBrowser();

    try {
      const excludedWorkIds = new Set<number>();
      const days: StaffingPeriodDayPlan[] = [];

      for (let offset = 0; offset < dayCount; offset += 1) {
        const dateIso = addIsoDays(selectedDateIso, offset);
        const result = buildMorningPlanForDate(dateIso, excludedWorkIds);
        const plannedIds = new Set(result.plan.map((item) => item.workId));
        plannedIds.forEach((workId) => excludedWorkIds.add(workId));
        days.push({ dateIso, plan: result.plan, worksNeedPeopleCount: result.worksNeedPeople.length });
        setPeriodPlanningCompletedDays(offset + 1);

        // Hver dagur er sjálfstæð reiknilota. Þetta kemur í veg fyrir að 5–31 daga
        // keyrsla haldi aðalþræði vafrans föstum í einni langri lotu.
        await yieldToBrowser();
      }

      setPeriodPlan(days);
      setPeriodDetailDateIso(days[0]?.dateIso ?? null);
    } finally {
      setPeriodPlanningBusy(false);
    }
  };

  const applyMorningPlan = async () => {
    if (bulkAssignmentBusy || morningPlan.length === 0) return;
    setBulkAssignmentBusy(true);
    setAssignmentFeedback(null);
    try {
      const byWork = new Map<number, {
        workOrderId: number;
        plannedStartMinutes: number;
        plannedEndMinutes: number;
        assignments: Array<{
          employeeId: number;
          workPartId: number;
          travelLeg: {
            fromLocationId: number;
            toLocationId: number;
            departureMinutes: number;
            arrivalMinutes: number;
            estimatedMinutes: number;
            distanceKm: number;
            estimateSource: string;
            trafficRuleCode: string | null;
          } | null;
          returnLeg: {
            fromLocationId: number;
            toLocationId: number;
            departureMinutes: number;
            arrivalMinutes: number;
            estimatedMinutes: number;
            distanceKm: number;
            estimateSource: string;
            trafficRuleCode: string | null;
          } | null;
        }>;
      }>();

      for (const item of morningPlan) {
        const work = activeWorkOrders.find((candidate) => candidate.id === item.workId);
        if (!work || item.projectedEndMinutes === null) continue;
        const part = work.workParts.find((candidate) => candidate.id === item.targetPartId) ?? null;
        if (!part || !part.persistedInWork10 || part.source.kind !== "WORK_PART") continue;
        const workPartId = Number(part.source.sourceId);
        if (!Number.isInteger(workPartId)) continue;

        const existing = byWork.get(work.id) ?? {
          workOrderId: work.id,
          plannedStartMinutes: item.plannedStartMinutes,
          plannedEndMinutes: item.projectedEndMinutes,
          assignments: [] as Array<{
            employeeId: number;
            workPartId: number;
            travelLeg: {
              fromLocationId: number;
              toLocationId: number;
              departureMinutes: number;
              arrivalMinutes: number;
              estimatedMinutes: number;
              distanceKm: number;
              estimateSource: string;
              trafficRuleCode: string | null;
            } | null;
            returnLeg: {
              fromLocationId: number;
              toLocationId: number;
              departureMinutes: number;
              arrivalMinutes: number;
              estimatedMinutes: number;
              distanceKm: number;
              estimateSource: string;
              trafficRuleCode: string | null;
            } | null;
          }>,
        };
        existing.plannedStartMinutes = Math.min(existing.plannedStartMinutes, item.plannedStartMinutes);
        existing.plannedEndMinutes = Math.max(existing.plannedEndMinutes, item.projectedEndMinutes);
        if (!existing.assignments.some((assignment) => assignment.employeeId === item.employeeId && assignment.workPartId === workPartId)) {
          existing.assignments.push({
            employeeId: item.employeeId,
            workPartId,
            travelLeg: item.travelFromLocationId && item.travelToLocationId && item.travelDepartureMinutes !== null
              ? {
                  fromLocationId: item.travelFromLocationId,
                  toLocationId: item.travelToLocationId,
                  departureMinutes: item.travelDepartureMinutes,
                  arrivalMinutes: item.travelDepartureMinutes + item.travelMinutes,
                  estimatedMinutes: item.travelMinutes,
                  distanceKm: item.travelDistanceKm,
                  estimateSource: item.travelSource ?? "MANUAL",
                  trafficRuleCode: item.trafficRuleCode,
                }
              : null,
            returnLeg: item.returnFromLocationId && item.returnToLocationId && item.returnDepartureMinutes !== null
              ? {
                  fromLocationId: item.returnFromLocationId,
                  toLocationId: item.returnToLocationId,
                  departureMinutes: item.returnDepartureMinutes,
                  arrivalMinutes: item.returnDepartureMinutes + item.returnMinutes,
                  estimatedMinutes: item.returnMinutes,
                  distanceKm: item.returnDistanceKm,
                  estimateSource: item.returnSource ?? "MANUAL",
                  trafficRuleCode: item.returnTrafficRuleCode,
                }
              : null,
          });
        }
        byWork.set(work.id, existing);
      }

      const works = [...byWork.values()];
      if (works.length === 0) throw new Error(t.noOpenPartForAssignment);
      const formData = new FormData();
      formData.set("plan", JSON.stringify({ plannedDate: selectedDateIso, works }));
      await applyWorkdayStaffingPlan(formData);

      setAssignmentFeedback({ kind: "success", text: `${t.staffingMorningApply} · ${works.length}` });
      setMorningPlan([]);
      setMorningStaffingOpen(false);
      router.refresh();
    } catch (error) {
      setAssignmentFeedback({ kind: "error", text: error instanceof Error ? error.message : t.assignmentDropError });
    } finally {
      setBulkAssignmentBusy(false);
    }
  };


  const handlePlanningSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (planningBusy) return;
    setPlanningBusy(true);
    setPlanningError(null);
    try {
      await updateWorkOrderPlanning(new FormData(event.currentTarget));
      setPlanningEditorOpen(false);
      router.refresh();
    } catch (error) {
      setPlanningError(error instanceof Error ? error.message : t.assignmentDropError);
    } finally {
      setPlanningBusy(false);
    }
  };

  const assignEmployeeToPart = async (employeeId: number, work: WorkOrderData, part: WorkPartData) => {
    if (assignmentBusy) return;
    if (isTerminalPartStatus(part.status)) {
      setAssignmentFeedback({ kind: "error", text: t.dropClosedPartError });
      return;
    }
    setAssignmentBusy(true);
    setAssignmentFeedback(null);
    try {
      const formData = new FormData();
      formData.set("workOrderId", String(work.id));
      formData.set("employeeId", String(employeeId));
      if (part.persistedInWork10 && part.source.kind === "WORK_PART") {
        formData.set("workPartId", part.source.sourceId);
        await assignPersonToWorkPart(formData);
      } else {
        formData.set("stayOnDashboard", "1");
        await persistLegacyFirstWorkPart(formData);
      }
      const personName = data.people.find((person) => person.id === employeeId)?.name ?? t.unknown;
      setAssignmentFeedback({ kind: "success", text: `${personName} · ${part.title}` });
      setPendingAssignment(null);
      router.refresh();
    } catch (error) {
      setAssignmentFeedback({ kind: "error", text: error instanceof Error ? error.message : t.assignmentDropError });
    } finally {
      setAssignmentBusy(false);
      setDropWorkId(null);
      setDropPartId(null);
      setDragEmployeeId(null);
    }
  };

  const requestAssignmentToWork = (employeeId: number, work: WorkOrderData) => {
    const openParts = work.workParts.filter((part) => !isTerminalPartStatus(part.status));
    if (openParts.length === 0) {
      setAssignmentFeedback({ kind: "error", text: t.noOpenPartForAssignment });
      return;
    }
    if (openParts.length === 1) {
      void assignEmployeeToPart(employeeId, work, openParts[0]);
      return;
    }
    setPendingAssignment({ employeeId, workId: work.id });
  };

  const handleWorkDrop = (event: DragEvent<HTMLElement>, work: WorkOrderData) => {
    event.preventDefault();
    const employeeId = employeeIdFromDrag(event);
    if (!employeeId) return;
    requestAssignmentToWork(employeeId, work);
  };

  const handlePartDrop = (event: DragEvent<HTMLElement>, work: WorkOrderData, part: WorkPartData) => {
    event.preventDefault();
    const employeeId = employeeIdFromDrag(event);
    if (!employeeId) return;
    void assignEmployeeToPart(employeeId, work, part);
  };

  const inProgressCount = data.workOrders.filter((work) => work.status === "IN_PROGRESS").length;
  const newCount = data.workOrders.filter(
    (work) => work.status === "DRAFT" || work.status === "READY",
  ).length;
  const completedCount = data.workOrders.filter((work) => work.status === "COMPLETED").length;
  const uniqueLoggedPeople = new Set(selectedDayLabor.map((entry) => entry.employeeId).filter((id): id is number => id !== null)).size;
  const machineResourceCount = data.resources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind)).length;

  const shiftDate = (days: number) => {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setUTCDate(next.getUTCDate() + days);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="w-full space-y-4">
        <section className="rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1">
              <label className="relative block max-w-xl">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={machinesEnabled ? t.searchWithMachines : t.searchWithoutMachines}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-600">
              <Link href="/verk/vinnutimi" className="rounded-lg border px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                {workTimeT.nav}
              </Link>
              <Link href="/verk/lyklar" className="rounded-lg border px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                {workKeyT.nav}
              </Link>
              <Link href="/verk/nytt" className="rounded-lg border px-3 py-2 font-semibold text-blue-700 hover:bg-blue-50">
                ＋ {t.newWork}
              </Link>
            </div>
          </div>

          <div className="px-5 pt-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950">{t.title}</h1>
                <p className="mt-1 text-sm text-slate-500">{t.subtitle}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => shiftDate(-1)} className="rounded-xl border px-3 py-2 text-slate-600 hover:bg-slate-50" type="button">←</button>
                <div className="min-w-[190px] rounded-xl border bg-white px-4 py-2 text-center text-sm font-semibold text-slate-800">
                  {work10FormatDate(selectedDate, data.language)}
                </div>
                <button
                  onClick={() => {
                    const now = new Date();
                    setSelectedDate(dateFromIsoDate(isoDateFromDate(now)));
                  }}
                  className="rounded-xl border px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                  type="button"
                >
                  {t.today}
                </button>
                <button onClick={() => shiftDate(1)} className="rounded-xl border px-3 py-2 text-slate-600 hover:bg-slate-50" type="button">→</button>
                <div className="ml-1 flex overflow-hidden rounded-xl border bg-slate-50 p-1">
                  {(["day", "week", "month"] as CalendarMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCalendarMode(mode)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium ${calendarMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-600"}`}
                    >
                      {mode === "day" ? t.calendar.day : mode === "week" ? t.calendar.week : t.calendar.month}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex overflow-x-auto border-b">
              <TabButton active={mainTab === "schedule"} onClick={() => setMainTab("schedule")}>{t.tabs.schedule}</TabButton>
              <TabButton active={mainTab === "list"} onClick={() => setMainTab("list")}>{t.tabs.list}</TabButton>
              <TabButton active={mainTab === "queue"} onClick={() => setMainTab("queue")}>{t.tabs.queue}</TabButton>
              <TabButton active={mainTab === "map"} onClick={() => setMainTab("map")}>{t.tabs.map}</TabButton>
              <Link
                href="/verk/tilfong"
                className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
              >
                {resourceT.equipmentNav}
              </Link>
              {machinesEnabled && (
                <TabButton
                  active={mainTab === "machines"}
                  onClick={() => setMainTab("machines")}
                >
                  {t.tabs.machines}
                </TabButton>
              )}
              <TabButton active={mainTab === "docs"} onClick={() => setMainTab("docs")}>{t.tabs.docs}</TabButton>
              <TabButton active={mainTab === "reports"} onClick={() => setMainTab("reports")}>{t.tabs.reports}</TabButton>
            </div>
          </div>

          {mainTab === "schedule" ? (
            <div className="grid min-h-[520px] xl:grid-cols-[270px_minmax(560px,1fr)_380px]">
              <aside className="border-r bg-white p-4">
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                  {resourceTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setResourceTab(tab)}
                      className={`rounded-lg px-2 py-2 text-sm font-semibold ${resourceTab === tab ? "bg-blue-600 text-white shadow-sm" : "text-slate-600"}`}
                    >
                      {tab === "people" ? `${t.resources.people} (${data.people.length})` : tab === "machines" ? `${t.resources.machines} (${machineResources.length})` : `${t.resources.teams} (${teamResources.length})`}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  {resourceTab === "people" ? (
                    <div>
                      <div className="mb-2 grid grid-cols-2 gap-1">
                        {([
                          ["all", t.filterAllPeople, scheduleStatusCounts.all],
                          ["available", t.available, scheduleStatusCounts.available],
                          ["assigned", t.assigned, scheduleStatusCounts.assigned],
                          ["working", t.working, scheduleStatusCounts.working],
                        ] as Array<[PersonStatusFilter, string, number]>).map(([value, label, count]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setPersonStatusFilter(value)}
                            className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-semibold transition ${
                              personStatusFilter === value
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50"
                            }`}
                          >
                            {label} <span className={personStatusFilter === value ? "text-blue-100" : "text-slate-400"}>({count})</span>
                          </button>
                        ))}
                      </div>

                      <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                        <span>{t.showingPeople}: <strong className="text-slate-700">{schedulePeople.length}</strong></span>
                        {snapshotMinute !== null ? <span className="font-semibold text-violet-700">{t.snapshotAt} {work10ClockFromMinutes(snapshotMinute)}</span> : null}
                      </div>

                      <div
                        ref={peopleListRef}
                        onScroll={(event) => syncPeopleScroll("list", event)}
                        className="overflow-y-auto overscroll-contain rounded-xl border bg-white"
                        style={{ height: `${PEOPLE_VIEWPORT_HEIGHT}px` }}
                      >
                        {schedulePeople.length === 0 ? (
                          <p className="p-4 text-sm text-slate-500">{t.noPeopleFound}</p>
                        ) : (
                          <div style={{ height: `${schedulePeople.length * PEOPLE_ROW_HEIGHT}px`, position: "relative" }}>
                            <div style={{ height: `${peopleTopSpacer}px` }} />
                            {virtualPeople.map((person) => {
                              const availability = personAvailabilityForFilter(person.id);
                              const snapshot = snapshotMinute !== null ? snapshotByPersonId.get(person.id) ?? null : null;
                              return (
                                <div
                                  key={person.id}
                                  draggable
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData("application/x-gloggt-employee", String(person.id));
                                    event.dataTransfer.setData("text/plain", String(person.id));
                                    event.dataTransfer.effectAllowed = "copy";
                                    setDragEmployeeId(person.id);
                                  }}
                                  onDragEnd={() => { setDragEmployeeId(null); setDropWorkId(null); setDropPartId(null); }}
                                  className={`border-b px-2 py-2 transition last:border-b-0 hover:bg-slate-50 ${
                                    dragEmployeeId === person.id ? "cursor-grabbing bg-blue-50 opacity-70" : "cursor-grab"
                                  }`}
                                  style={{ height: `${PEOPLE_ROW_HEIGHT}px` }}
                                  title={t.dragPersonHint}
                                >
                                  <div className="flex h-full items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">{initials(person.name)}</div>
                                    <div className="min-w-0 flex-1">
                                      <button
                                        type="button"
                                        onClick={() => { setSelectedPersonId(person.id); setLaborPeriod("day"); }}
                                        className="block max-w-full truncate text-left text-xs font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                                      >
                                        {person.name}
                                      </button>
                                      <p className="truncate text-[10px] text-slate-500">{person.jobTitle ?? t.roles.DEFAULT}</p>
                                      {snapshot ? (
                                        <p className={`truncate text-[10px] font-semibold ${
                                          snapshot.kind === "actual" ? "text-emerald-700" : snapshot.kind === "planned" ? "text-blue-700" : "text-slate-400"
                                        }`}>
                                          {snapshotStatusLabel(snapshot.kind, t)}{snapshot.work ? ` · ${snapshot.work.title}` : ""}
                                        </p>
                                      ) : null}
                                    </div>
                                    <div className="shrink-0 text-[10px] text-slate-500">
                                      <span className="flex items-center gap-1"><StatusDot status={availability} />{availability === "working" ? t.working : availability === "assigned" ? t.assigned : t.available}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <div style={{ height: `${peopleBottomSpacer}px` }} />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-xl border border-dashed bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                        <strong className="text-slate-700">{t.dragPersonHelp}</strong><br />
                        {t.virtualPeopleHelp}
                      </div>
                    </div>
                  ) : resourceTab === "machines" ? (
                    <div className="space-y-2">
                      {machineResources.length === 0 ? (
                        <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm leading-6 text-slate-500">{t.machinesEmpty}</div>
                      ) : machineResources.map((resource) => (
                        <Link key={resource.id} href="/verk/tilfong" className="block rounded-xl border bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{resource.name}</p>
                              <p className="mt-1 text-xs text-slate-500">{workResourceKindText(resource.kind, data.language)} · {resource.code}</p>
                            </div>
                            <StatusDot status={resource.status === "IN_USE" ? "working" : "available"} />
                          </div>
                          <p className="mt-2 text-xs text-slate-600">{workResourceStatusText(resource.status, data.language)}{resource.meterValue !== null ? ` · ${resource.meterValue} ${resource.meterUnit ?? ""}` : ""}</p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {teamResources.length === 0 ? (
                        <div className="rounded-xl border border-dashed bg-slate-50 p-5 text-sm leading-6 text-slate-500">{t.teamResourcePlaceholder}</div>
                      ) : teamResources.map((resource) => (
                        <Link key={resource.id} href="/verk/tilfong" className="block rounded-xl border bg-white p-3 hover:border-blue-300 hover:bg-blue-50/40">
                          <p className="text-sm font-semibold text-slate-900">{resource.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{resource.code} · {resource.memberCount} {t.resources.people.toLowerCase()}</p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              <section className="min-w-0 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold text-slate-900">{t.scheduleTitle}</h2>
                    <p className="text-xs text-slate-500">{t.scheduleHelp}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{calendarMode === "day" ? t.dayView : calendarMode === "week" ? t.weekView : t.monthView}</span>
                    {calendarMode === "day" ? (
                      <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
                        <button type="button" onClick={() => moveTimeline(-1)} disabled={timelineStartMinutes <= TIMELINE_MIN_START_MINUTES} aria-label={t.timelineBack} title={t.timelineBack} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35">←</button>
                        <button type="button" onClick={followCurrentTime} disabled={!showingToday} title={t.timelineNow} className={`rounded-md px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${timelineFollowNow && showingToday ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-50"}`}>{t.timelineNow}</button>
                        <button type="button" onClick={() => moveTimeline(1)} disabled={timelineStartMinutes >= TIMELINE_MAX_START_MINUTES} aria-label={t.timelineForward} title={t.timelineForward} className="rounded-md px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35">→</button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mb-3 flex flex-col gap-2 rounded-xl border bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-800">{t.snapshotTitle}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{t.snapshotHelp}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={snapshotInput}
                      onChange={(event) => setSnapshotInput(event.target.value.replace(/[^0-9:]/g, "").slice(0, 5))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applySnapshot();
                        }
                      }}
                      onBlur={() => {
                        if (snapshotInput.trim()) applySnapshot();
                      }}
                      inputMode="numeric"
                      placeholder="14:00"
                      className="w-24 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                    />
                    <button type="button" onClick={applySnapshot} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700">
                      {t.showSnapshot}
                    </button>
                    {snapshotMinute !== null ? (
                      <button type="button" onClick={clearSnapshot} className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        {t.clearSnapshot}
                      </button>
                    ) : null}
                  </div>
                </div>

                {assignmentFeedback ? (
                  <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${assignmentFeedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
                    {assignmentFeedback.kind === "success" ? `${t.assignmentDropSuccess}: ` : ""}{assignmentFeedback.text}
                  </div>
                ) : null}

                {unscheduledForSelectedDay.length > 0 ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><h3 className="text-sm font-bold text-amber-950">{t.unscheduledToday}</h3><p className="mt-0.5 text-[11px] text-amber-800">{t.unscheduledTodayHelp}</p></div>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-800">{unscheduledForSelectedDay.length}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {unscheduledForSelectedDay.map((work) => (
                        <button key={work.id} type="button" onClick={() => setSelectedWorkId(work.id)} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropWorkId(work.id); }} onDragLeave={() => setDropWorkId((current) => current === work.id ? null : current)} onDrop={(event) => handleWorkDrop(event, work)} className={`rounded-lg border bg-white px-3 py-2 text-left text-xs shadow-sm ${dropWorkId === work.id ? "border-emerald-500 ring-2 ring-emerald-200" : selectedWork?.id === work.id ? "border-blue-500" : "border-amber-200 hover:border-blue-300"}`}>
                          <strong className="block text-slate-900">{work.title}</strong>
                          <span className="mt-0.5 block text-[10px] text-slate-500">#{work.workNumber} · {work.estimatedMinutes ? formatMinutesDuration(work.estimatedMinutes, t.hoursShort, t.minutesShort) : t.notRegistered}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {outsideTimelineForSelectedDay.length > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <strong>{t.outsideVisibleHours}:</strong>
                    {outsideTimelineForSelectedDay.map((work) => <button key={work.id} type="button" onClick={() => { setSelectedWorkId(work.id); focusTimelineOnMinute(work.plannedStartMinutes); }} className="rounded-md bg-white px-2 py-1 font-semibold text-blue-700 hover:underline">{work10ClockFromMinutes(work.plannedStartMinutes)} · {work.title}</button>)}
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-2xl border">
                  <div className="grid grid-cols-10 border-b bg-slate-50">
                    {visibleTimelineHours.map((hour) => <div key={hour} className="border-r px-2 py-2 text-center text-xs font-medium text-slate-500 last:border-r-0">{hour}</div>)}
                  </div>

                  <div className="relative min-h-[430px] bg-white">
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: "linear-gradient(to right, rgb(226 232 240) 1px, transparent 1px), linear-gradient(to bottom, rgb(241 245 249) 1px, transparent 1px)",
                        backgroundSize: `10% 100%, 100% ${PEOPLE_ROW_HEIGHT}px`,
                      }}
                    />
                    {currentTimeLeft ? (
                      <div className="pointer-events-none absolute inset-y-0 z-30 w-px bg-rose-500" style={{ left: currentTimeLeft }}>
                        <span className="absolute left-1 top-1 whitespace-nowrap rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{t.currentTimeLabel} {work10ClockFromMinutes(currentTimelineMinute)}</span>
                      </div>
                    ) : null}
                    {snapshotTimeLeft ? (
                      <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-violet-500" style={{ left: snapshotTimeLeft }}>
                        <span className="absolute left-1 top-6 whitespace-nowrap rounded bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white">{t.snapshotAt} {work10ClockFromMinutes(snapshotMinute)}</span>
                      </div>
                    ) : null}

                    <div className="relative divide-y">
                      <div className="relative bg-blue-50/30 px-2 py-2" style={{ height: `${Math.max(58, 32 + visibleScheduledForSelectedDay.length * 34)}px` }}>
                        <span className="absolute left-2 top-2 rounded-md bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-800">{t.unassignedInNewCore}</span>
                        {visibleScheduledForSelectedDay.length === 0 ? (
                          <span className="absolute left-32 top-3 text-[11px] text-slate-400">{t.noScheduledWorkForDay}</span>
                        ) : visibleScheduledForSelectedDay.map((work, index) => {
                          const pos = timelinePosition(work.plannedStartMinutes!, storedPlannedDurationMinutes(work), timelineStartMinutes, timelineEndMinutes);
                          const end = work10ClockFromMinutes(storedPlannedEndMinutes(work));
                          return (
                            <button
                              key={work.id}
                              type="button"
                              title={`${work10ClockFromMinutes(work.plannedStartMinutes)}${end ? `–${end}` : ""} · ${work.title}`}
                              onClick={() => setSelectedWorkId(work.id)}
                              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropWorkId(work.id); }}
                              onDragLeave={() => setDropWorkId((current) => current === work.id ? null : current)}
                              onDrop={(event) => handleWorkDrop(event, work)}
                              style={{ left: pos.left, width: pos.width, top: `${30 + index * 34}px`, minWidth: "12px" }}
                              className={`absolute h-7 overflow-hidden rounded-md border px-1.5 text-left text-[10px] shadow-sm transition ${
                                dropWorkId === work.id ? "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-200" : selectedWork?.id === work.id ? "border-blue-600 bg-blue-100 ring-2 ring-blue-100" : "border-blue-200 bg-white hover:border-blue-400"
                              }`}
                            >
                              <span className="block truncate font-semibold text-slate-900">{work.title}</span>
                              <span className="block truncate text-[9px] text-slate-500">{work10ClockFromMinutes(work.plannedStartMinutes)}{end ? `–${end}` : ""}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div
                        ref={peopleTimelineRef}
                        onScroll={(event) => syncPeopleScroll("timeline", event)}
                        className="overflow-y-auto overscroll-contain border-t"
                        style={{ height: `${PEOPLE_VIEWPORT_HEIGHT}px` }}
                      >
                        {schedulePeople.length === 0 ? (
                          <div className="flex h-24 items-center justify-center text-sm text-slate-400">{t.noPeopleFound}</div>
                        ) : (
                          <div style={{ height: `${schedulePeople.length * PEOPLE_ROW_HEIGHT}px`, position: "relative" }}>
                            <div style={{ height: `${peopleTopSpacer}px` }} />
                            {virtualPeople.map((person) => {
                              const personLogs = timelineLabor.filter((log) => log.employeeId === person.id && log.startedAt);
                              const personPlanned = visibleScheduledForSelectedDay.filter((work) => work.workParts.some((part) => part.assignedEmployeeIds.includes(person.id)));
                              const snapshot = snapshotMinute !== null ? snapshotByPersonId.get(person.id) ?? null : null;
                              return (
                                <div
                                  key={person.id}
                                  className={`relative border-b ${snapshot?.kind === "actual" ? "bg-emerald-50/25" : snapshot?.kind === "planned" ? "bg-blue-50/25" : ""}`}
                                  style={{ height: `${PEOPLE_ROW_HEIGHT}px` }}
                                >
                                  {personPlanned.map((work) => {
                                    const pos = timelinePosition(work.plannedStartMinutes!, storedPlannedDurationMinutes(work), timelineStartMinutes, timelineEndMinutes);
                                    const end = work10ClockFromMinutes(storedPlannedEndMinutes(work));
                                    return (
                                      <button
                                        key={`planned-${person.id}-${work.id}`}
                                        type="button"
                                        title={`${t.scheduleSlot}: ${work10ClockFromMinutes(work.plannedStartMinutes)}${end ? `–${end}` : ""} · ${work.title}`}
                                        onClick={() => setSelectedWorkId(work.id)}
                                        style={{ left: pos.left, width: pos.width, minWidth: "12px" }}
                                        className="absolute top-1 h-7 overflow-hidden rounded-md border border-blue-300 bg-blue-50 px-1.5 text-left text-[9px] shadow-sm"
                                      >
                                        <span className="block truncate font-semibold text-blue-950">{work.title}</span>
                                        <span className="block truncate text-[8px] text-blue-700">{work10ClockFromMinutes(work.plannedStartMinutes)}{end ? `–${end}` : ""}</span>
                                      </button>
                                    );
                                  })}
                                  {personLogs.map((log, index) => {
                                    const pos = laborTimelinePosition(log.startedAt!, log.endedAt, log.durationMinutes, timelineStartMinutes, timelineEndMinutes);
                                    return (
                                      <button
                                        key={log.id}
                                        type="button"
                                        onClick={() => { if (log.workId !== null) setSelectedWorkId(log.workId); }}
                                        style={{ left: pos.left, width: pos.width, minWidth: "12px" }}
                                        className={`absolute top-9 h-7 overflow-hidden rounded-md border px-1.5 text-left text-[9px] shadow-sm ${
                                          index % 3 === 0 ? "border-emerald-300 bg-emerald-100" : index % 3 === 1 ? "border-sky-300 bg-sky-100" : "border-violet-300 bg-violet-100"
                                        }`}
                                      >
                                        <span className="block truncate font-semibold text-slate-900">{log.workTitle}</span>
                                        <span className="block truncate text-[8px] text-slate-600">{formatTime(log.startedAt)}–{formatTime(log.endedAt) ?? "…"}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            <div style={{ height: `${peopleBottomSpacer}px` }} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="border-l bg-slate-50 p-4">
                {selectedWork ? (
                  <div
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDropWorkId(selectedWork.id); }}
                    onDragLeave={() => setDropWorkId((current) => current === selectedWork.id ? null : current)}
                    onDrop={(event) => handleWorkDrop(event, selectedWork)}
                    className={`sticky top-4 rounded-2xl border bg-white p-4 shadow-sm transition ${dropWorkId === selectedWork.id ? "border-emerald-500 ring-2 ring-emerald-200" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.selectedWork}</p>
                        <Link href={`/verk/${selectedWork.id}`} className="group block">
                          <h2 className="mt-1 text-xl font-bold text-slate-950 group-hover:text-blue-700 group-hover:underline">{selectedWork.title}</h2>
                          <p className="mt-1 text-xs text-slate-500">#{selectedWork.workNumber}{selectedWork.workKey ? ` · ${selectedWork.workKey}` : ""}{selectedWork.address ? ` · ${selectedWork.address}` : ""}</p>
                        </Link>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${selectedWork.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : selectedWork.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-700"}`}>{work10StatusText(selectedWork.status, data.language)}</span>
                        {selectedWork.readyToClose ? (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">{t.readyToCloseBadge}</span>
                        ) : null}
                      </div>
                    </div>

                    {selectedWork.description && (
                      <Link
                        href={`/verk/${selectedWork.id}`}
                        className="mt-4 block rounded-lg text-sm leading-6 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      >
                        {selectedWork.description}
                      </Link>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-400">{t.priority}</p><p className="mt-1 font-semibold text-slate-800">{work10PriorityText(selectedWork.priority, data.language)}</p></div>
                      <button type="button" title={t.staffingAction} onClick={() => setStaffingWorkId(selectedWork.id)} className="rounded-xl bg-slate-50 p-3 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200">
                        <p className="text-slate-400">{t.staffing}</p><p className="mt-1 font-semibold text-slate-800">{selectedAssignedPeople.length} / {selectedWork.requiredPeople} {t.assignedShort}</p>
                      </button>
                      <button type="button" title={t.planningTitle} onClick={() => { setPlanningError(null); setPlanningEditorOpen(true); }} className="rounded-xl bg-slate-50 p-3 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200">
                        <p className="text-slate-400">{t.plannedDate}</p><p className="mt-1 font-semibold text-slate-800">{selectedWork.plannedDate ? work10FormatDate(dateFromIsoDate(selectedWork.plannedDate), data.language) : t.notRegistered}</p>
                      </button>
                      <button type="button" title={t.planningTitle} onClick={() => { setPlanningError(null); setPlanningEditorOpen(true); }} className="rounded-xl bg-slate-50 p-3 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200">
                        <p className="text-slate-400">{t.plannedStartTime}</p><p className="mt-1 font-semibold text-slate-800">{selectedWork.plannedStartMinutes !== null ? (() => { const end = work10ClockFromMinutes(storedPlannedEndMinutes(selectedWork)); return `${work10ClockFromMinutes(selectedWork.plannedStartMinutes)}${end ? `–${end}` : ""}`; })() : selectedWork.plannedDate ? t.timeNotDecided : t.notRegistered}</p>
                      </button>
                      <button type="button" title={t.planningTitle} onClick={() => { setPlanningError(null); setPlanningEditorOpen(true); }} className="rounded-xl bg-slate-50 p-3 text-left transition hover:bg-blue-50 hover:ring-1 hover:ring-blue-200">
                        <p className="text-slate-400">{t.plannedTime}</p><p className="mt-1 font-semibold text-slate-800">{selectedWork.estimatedMinutes ? formatMinutesDuration(selectedWork.estimatedMinutes, t.hoursShort, t.minutesShort) : t.notRegistered}</p>
                      </button>
                      <button type="button" title={t.planningTitle} onClick={() => { setPlanningError(null); setPlanningEditorOpen(true); }} className="rounded-xl bg-slate-50 p-3 text-left transition hover:bg-amber-50 hover:ring-1 hover:ring-amber-200">
                        <p className="text-slate-400">{t.completionDeadline}</p>
                        <p className="mt-1 font-semibold text-slate-800">{selectedWork.completionDeadlineDate && selectedWork.completionDeadlineMinutes !== null ? `${work10FormatDate(dateFromIsoDate(selectedWork.completionDeadlineDate), data.language)} · ${work10ClockFromMinutes(selectedWork.completionDeadlineMinutes)}` : t.notRegistered}</p>
                        {selectedWork.allowAfterWorkdayEnd ? <p className="mt-1 text-[10px] font-semibold text-amber-700">{t.allowAfterWorkdayEnd}</p> : null}
                      </button>
                      <div className="rounded-xl bg-slate-50 p-3"><p className="text-slate-400">{t.timeEntries}</p><p className="mt-1 font-semibold text-slate-800">{selectedWork.actualLabor.length}</p></div>
                    </div>

                    {planningEditorOpen ? (
                      <form key={`planning-${selectedWork.id}`} onSubmit={handlePlanningSubmit} className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3">
                        <input type="hidden" name="workOrderId" value={selectedWork.id} />
                        <input type="hidden" name="photoRequirement" value={selectedWork.photoRequirement} />
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-slate-900">{t.planningTitle}</h3>
                          <button type="button" onClick={() => { setPlanningError(null); setPlanningEditorOpen(false); }} className="rounded-lg border bg-white px-2.5 py-1 text-sm font-bold text-slate-500 hover:bg-slate-50" aria-label={t.planningTitle}>×</button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="text-[11px] font-semibold text-slate-600">
                            {t.requiredPeople}
                            <input name="requiredPeople" type="number" min={1} max={100} defaultValue={selectedWork.requiredPeople} required className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900" />
                          </label>
                          <div>
                            <span className="text-[11px] font-semibold text-slate-600">{t.estimatedTime}</span>
                            <div className="mt-1 grid grid-cols-2 gap-1.5">
                              <label className="text-[10px] text-slate-500">{t.estimatedHours}<input name="estimatedHours" type="number" min={0} max={999} defaultValue={Math.floor((selectedWork.estimatedMinutes ?? 0) / 60)} className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm text-slate-900" /></label>
                              <label className="text-[10px] text-slate-500">{t.estimatedMinutes}<input name="estimatedMinutePart" type="number" min={0} max={59} defaultValue={(selectedWork.estimatedMinutes ?? 0) % 60} className="mt-1 w-full rounded-lg border bg-white px-2 py-2 text-sm text-slate-900" /></label>
                            </div>
                          </div>
                          <div className="col-span-2">
                            <IcelandicDateInput
                              name="plannedDate"
                              label={t.plannedDate}
                              defaultValue={selectedWork.plannedDate ?? ""}
                              submitFormat="iso"
                              calendarButtonLabel={t.plannedDate}
                              labelClassName="text-[11px] font-semibold text-slate-600"
                              inputClassName="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                              buttonClassName="rounded-lg border bg-white px-3 py-2 hover:bg-slate-50"
                            />
                          </div>
                          <div className="col-span-2">
                            <span className="text-[11px] font-semibold text-slate-600">{t.plannedStartTime}</span>
                            <IcelandicTimeInput
                              hourName="plannedStartHour"
                              minuteName="plannedStartMinute"
                              defaultValue={selectedWork.plannedStartMinutes !== null ? work10ClockFromMinutes(selectedWork.plannedStartMinutes) ?? "" : ""}
                              pickerLabel={t.plannedStartTime}
                              hourLabel={t.estimatedHours}
                              minuteLabel={t.estimatedMinutes}
                              inputClassName="w-full rounded-l-lg border border-r-0 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                            <p className="mt-1 text-[10px] leading-4 text-slate-500">{t.plannedStartTimeHelp}</p>
                          </div>
                          <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                            <div className="grid grid-cols-2 gap-2">
                              <IcelandicDateInput
                                name="completionDeadlineDate"
                                label={t.completionDeadlineDate}
                                defaultValue={selectedWork.completionDeadlineDate ?? ""}
                                submitFormat="iso"
                                calendarButtonLabel={t.completionDeadlineDate}
                                labelClassName="text-[11px] font-semibold text-slate-600"
                                inputClassName="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
                                buttonClassName="rounded-lg border bg-white px-3 py-2 hover:bg-slate-50"
                              />
                              <div>
                                <span className="text-[11px] font-semibold text-slate-600">{t.completionDeadlineTime}</span>
                                <IcelandicTimeInput
                                  hourName="completionDeadlineHour"
                                  minuteName="completionDeadlineMinute"
                                  defaultValue={selectedWork.completionDeadlineMinutes !== null ? work10ClockFromMinutes(selectedWork.completionDeadlineMinutes) ?? "" : ""}
                                  pickerLabel={t.completionDeadlineTime}
                                  hourLabel={t.estimatedHours}
                                  minuteLabel={t.estimatedMinutes}
                                  inputClassName="w-full rounded-l-lg border border-r-0 bg-white px-3 py-2 text-sm text-slate-900"
                                />
                              </div>
                            </div>
                            <p className="mt-1 text-[10px] leading-4 text-slate-500">{t.completionDeadlineHelp}</p>
                            <label className="mt-2 flex items-start gap-2 text-[11px] font-semibold text-slate-700">
                              <input type="checkbox" name="allowAfterWorkdayEnd" defaultChecked={selectedWork.allowAfterWorkdayEnd} className="mt-0.5" />
                              <span>{t.allowAfterWorkdayEnd}</span>
                            </label>
                            <label className="mt-2 block text-[10px] font-semibold text-slate-600">
                              {t.workdayEndExceptionReason}
                              <input name="workdayEndExceptionReason" type="text" maxLength={500} defaultValue={selectedWork.workdayEndExceptionReason ?? ""} placeholder={t.workdayEndExceptionReasonPlaceholder} className="mt-1 w-full rounded-lg border bg-white px-2.5 py-2 text-xs text-slate-900" />
                            </label>
                            <p className="mt-1 text-[10px] leading-4 text-slate-500">{t.allowAfterWorkdayEndHelp}</p>
                          </div>
                        </div>
                        {planningError ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{planningError}</p> : null}
                        <button type="submit" disabled={planningBusy} className="mt-3 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{t.savePlanning}</button>
                      </form>
                    ) : null}
                    {selectedWork.address ? (
                      <a href={directionsUrl(selectedWork.address)} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                        ⌖ {t.openDirections}
                      </a>
                    ) : null}

                    <div className="mt-5 border-b">
                      <div className="flex gap-4 text-xs font-semibold text-slate-500">
                        <span className="border-b-2 border-blue-600 pb-2 text-blue-700">{t.people}</span>
                        {machinesEnabled && <span className="pb-2">{t.machines}</span>}
                        <span className="pb-2">{t.docs}</span>
                        <span className="pb-2">{t.notes}</span>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {selectedAssignedPeople.length === 0 ? (
                        <p className="rounded-xl border border-dashed p-3 text-xs leading-5 text-slate-500">{t.noFormalAssignments}</p>
                      ) : (
                        selectedAssignedPeople.map((person) => {
                          const minutes = selectedWork.actualLabor.filter((log) => log.employeeId === person.id).reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0);
                          return (
                            <button key={person.id} type="button" onClick={() => { setSelectedPersonId(person.id); setLaborPeriod("day"); }} className="flex w-full items-center gap-3 rounded-xl border p-2.5 text-left hover:border-blue-300 hover:bg-blue-50/40">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{initials(person.name)}</div>
                              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{person.name}</p><p className="text-[11px] text-slate-500">{t.assigned}{minutes > 0 ? ` · ${formatMinutesDuration(minutes, t.hoursShort, t.minutesShort)}` : ""}</p></div>
                            </button>
                          );
                        })
                      )}
                    </div>

                    {selectedAssignedPeople.length < selectedWork.requiredPeople && suggestedPeopleForSelectedWork.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-bold text-blue-900">{t.availableSuggestions}</h3>
                          <span className="text-[10px] font-semibold text-blue-600">{t.dataFirstSuggestions}</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-5 text-blue-800">{t.availabilitySuggestionHelp}</p>
                        <div className="mt-2 space-y-2">
                          {suggestedPeopleForSelectedWork.map(({ person, availability }) => (
                            <button
                              key={person.id}
                              type="button"
                              draggable
                              onDragStart={(event) => { event.dataTransfer.setData("text/gloggt-employee-id", String(person.id)); event.dataTransfer.effectAllowed = "copy"; setDragEmployeeId(person.id); }}
                              onDragEnd={() => setDragEmployeeId(null)}
                              onClick={() => requestAssignmentToWork(person.id, selectedWork)}
                              disabled={assignmentBusy}
                              className="flex w-full items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-left hover:border-blue-300 disabled:opacity-50"
                            >
                              <span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{person.name}</strong><span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500"><StatusDot status={availability} />{availability === "working" ? t.working : availability === "assigned" ? t.assigned : t.available}</span></span>
                              <span className="text-xs font-semibold text-blue-700">{t.assignPersonAction}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border p-3"><p className="text-xs text-slate-400">{t.plannedTime}</p><p className="mt-1 font-semibold text-slate-700">{selectedWork.estimatedMinutes ? formatMinutesDuration(selectedWork.estimatedMinutes, t.hoursShort, t.minutesShort) : t.notRegistered}</p></div>
                      <div className="rounded-xl border p-3"><p className="text-xs text-slate-400">{t.actualTime}</p><p className="mt-1 font-semibold text-slate-700">{Math.round(selectedWork.actualLabor.reduce((sum, log) => sum + (log.durationMinutes ?? 0), 0) / 60 * 10) / 10} {t.hoursShort}</p></div>
                    </div>

                    <div className="mt-5 rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-900">{t.workParts}</h3>
                        <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700">{selectedWork.workParts.length}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">{t.workPartsHelp}</p>
                      <div className="mt-3 space-y-2">
                        {selectedWork.workParts.map((part) => (
                          <div
                            key={part.id}
                            onDragOver={(event) => { if (!isTerminalPartStatus(part.status)) { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setDropPartId(part.id); } }}
                            onDragLeave={() => setDropPartId((current) => current === part.id ? null : current)}
                            onDrop={(event) => { event.stopPropagation(); handlePartDrop(event, selectedWork, part); }}
                            className={`rounded-lg border bg-white transition ${dropPartId === part.id ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "hover:border-blue-300 hover:bg-blue-50/40"} ${isTerminalPartStatus(part.status) ? "opacity-75" : ""}`}
                          >
                            <Link href={`/verk/${selectedWork.id}`} className="block p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{part.title}</p>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    {t.partOrder}: {part.order} · {part.persistedInWork10 ? t.persistedInNewCore : t.projectedFromCurrentWork}
                                  </p>
                                  <p className="mt-1 text-[10px] font-medium text-slate-600">
                                    {part.assignedEmployeeIds.length}/{part.requiredPeople} {t.assignedShort}
                                    {part.estimatedMinutes ? ` · ${formatMinutesDuration(part.estimatedMinutes, t.hoursShort, t.minutesShort)}` : ""}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{work10StatusText(part.status, data.language)}</span>
                              </div>
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-dashed bg-emerald-50/60 p-3 text-[11px] leading-5 text-emerald-900">{t.dropEmployeeOnWorkHelp}</div>
                    <Link href={`/verk/${selectedWork.id}`} className="mt-4 block rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-700">{t.openWork}</Link>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed bg-white p-6 text-sm text-slate-500">{t.noWork}</div>
                )}
              </aside>
            </div>
          ) : (
            <div className="p-5">
              <div className="rounded-2xl border bg-slate-50 p-6">
                <h2 className="text-xl font-bold text-slate-950">
                  {mainTab === "list" ? t.tabs.list : mainTab === "queue" ? t.tabs.queue : mainTab === "map" ? t.tabs.map : mainTab === "machines" ? t.tabs.machines : mainTab === "docs" ? t.tabs.docs : t.tabs.reports}
                </h2>
                {mainTab !== "list" && mainTab !== "machines" ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t.tabPlaceholder}</p> : null}
                {mainTab === "list" && (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-indigo-950">{t.staffingMorningTitle}</h3>
                          <p className="mt-1 max-w-3xl text-xs leading-5 text-indigo-800">{t.staffingMorningHelp}</p>
                          <p className="mt-1 text-[11px] font-medium text-indigo-700">{t.staffingMorningPriorityHelp}</p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-[11px] font-semibold text-indigo-900">
                            {t.staffingMorningTime}
                            <input value={morningTimeInput} onChange={(event) => setMorningTimeInput(event.target.value)} inputMode="numeric" className="mt-1 w-24 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900" placeholder="08:00" />
                          </label>
                          <label className="text-[11px] font-semibold text-indigo-900">
                            {t.staffingPeriodDays}
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={periodDaysInput}
                              onChange={(event) => setPeriodDaysInput(event.target.value)}
                              className="mt-1 w-24 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
                            />
                          </label>
                          <button type="button" onClick={generateMorningPlan} className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50">{t.staffingMorningGenerate}</button>
                          <button
                            type="button"
                            onClick={generatePeriodPlan}
                            disabled={periodPlanningBusy}
                            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                          >
                            {periodPlanningBusy
                              ? `${t.staffingPeriodGenerate} · ${periodPlanningCompletedDays}/${periodPlanningTotalDays}`
                              : t.staffingPeriodGenerate}
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-white p-3 text-xs text-slate-600"><span className="block text-lg font-bold text-slate-950">{morningUnassignedPeopleCount}</span>{t.staffingMorningUnassignedPeople}</div>
                        <div className="rounded-lg bg-white p-3 text-xs text-slate-600"><span className="block text-lg font-bold text-slate-950">{morningWorksNeedPeople.length}</span>{t.staffingMorningWorksNeedPeople}</div>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-sm font-bold text-slate-700">{t.activeWork}</h3>
                        <span className="text-[11px] text-slate-500">{t.activeWorkSortHelp}</span>
                      </div>
                      <div className="divide-y overflow-hidden rounded-xl border bg-white">
                        {filteredActiveWorkOrders.length === 0 ? (
                          <p className="p-4 text-sm text-slate-500">{t.noWorkToShow}</p>
                        ) : filteredActiveWorkOrders.map((work) => {
                          const assignedCount = assignedPeopleCount(work);
                          const deficit = staffingDeficit(work, data.people);
                          const needsStaffingAttention = staffingNeedsAttention(work, data.people);
                          const isUnassignedBacklog = deficit > 0 && assignedCount === 0 && !work.plannedDate && work.status === "DRAFT";
                          return (
                            <div key={work.id} className={`flex flex-col gap-3 p-4 hover:bg-slate-50 md:flex-row md:items-center md:justify-between ${needsStaffingAttention ? "bg-amber-50/25" : ""}`}>
                              <Link href={`/verk/${work.id}`} className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900">{work.title}</p>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${work.priority === "URGENT" ? "bg-red-100 text-red-700" : work.priority === "HIGH" ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-600"}`}>{work10PriorityText(work.priority, data.language)}</span>
                                  {work.completionDeadlineDate && work.completionDeadlineMinutes !== null ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t.completionDeadline}: {work10FormatDate(dateFromIsoDate(work.completionDeadlineDate), data.language)} {work10ClockFromMinutes(work.completionDeadlineMinutes)}</span>
                                  ) : null}
                                  {needsStaffingAttention ? (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t.staffingNeedsAttention}: {deficit}</span>
                                  ) : deficit <= 0 ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{t.staffingFullyStaffed}</span>
                                  ) : isUnassignedBacklog ? (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{t.staffingUnassignedBacklog}</span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-sm text-slate-500">#{work.workNumber}{work.workKey ? ` · ${work.workKey}` : ""}{work.address ? ` · ${work.address}` : ""} · {assignedCount}/{work.requiredPeople} {t.assignedShort}{work.plannedDate ? ` · ${work10FormatDate(dateFromIsoDate(work.plannedDate), data.language)}` : ""}{work.plannedStartMinutes !== null ? ` ${work10ClockFromMinutes(work.plannedStartMinutes)}` : ""}</p>
                              </Link>
                              <div className="flex shrink-0 items-center gap-2">
                                {deficit > 0 ? <button type="button" onClick={() => setStaffingWorkId(work.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">{t.staffingAction}</button> : null}
                                <Link href={`/verk/${work.id}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200">{work10StatusText(work.status, data.language)}</Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {filteredCompletedWorkOrders.length > 0 ? (
                      <details className="rounded-xl border bg-white">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">{t.completedArchive} ({filteredCompletedWorkOrders.length})</summary>
                        <div className="divide-y border-t">
                          {filteredCompletedWorkOrders.map((work) => (
                            <Link key={work.id} href={`/verk/${work.id}`} className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-50">
                              <div><p className="font-semibold text-slate-800">{work.title}</p><p className="text-sm text-slate-500">#{work.workNumber}{work.workKey ? ` · ${work.workKey}` : ""}</p></div>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{work10StatusText(work.status, data.language)}</span>
                            </Link>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                )}
                {mainTab === "machines" && (
                  <div className="mt-5">
                    <div className="mb-3 flex justify-end"><Link href="/verk/tilfong" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">{resourceT.manageResources}</Link></div>
                    {machineResources.length === 0 ? (
                      <div className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-500">{t.machinesEmpty}</div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {machineResources.map((resource) => (
                          <Link key={resource.id} href="/verk/tilfong" className="rounded-xl border bg-white p-4 hover:border-blue-300 hover:bg-blue-50/30">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0"><p className="font-semibold text-slate-900">{resource.name}</p><p className="mt-1 text-xs text-slate-500">{workResourceKindText(resource.kind, data.language)} · {resource.code}</p></div>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">{workResourceStatusText(resource.status, data.language)}</span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                              <div className="rounded-lg bg-slate-50 p-2"><div>{resourceT.activeAssignments}</div><strong className="mt-1 block text-slate-900">{resource.activeAssignmentCount}</strong></div>
                              <div className="rounded-lg bg-slate-50 p-2"><div>{resourceT.latestMeter}</div><strong className="mt-1 block text-slate-900">{resource.meterValue !== null ? `${resource.meterValue} ${resource.meterUnit ?? ""}` : "—"}</strong></div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section
          className={`grid gap-4 ${
            machinesEnabled
              ? "xl:grid-cols-[1.15fr_1fr_1fr_0.95fr]"
              : "xl:grid-cols-[1.25fr_1fr_1fr]"
          }`}
        >
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">{t.newWork}</h2><span className="rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700">{t.basicInfoStep}</span></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">{t.workTitle}<input disabled placeholder={t.workTitlePlaceholder} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">{t.description}<input disabled placeholder={t.shortDescription} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">{t.workKey}<input disabled placeholder={t.selectedLater} className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
              <label className="text-xs font-medium text-slate-600">{t.priority}<input disabled value={work10PriorityText("NORMAL", data.language)} readOnly className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm" /></label>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">{t.saveDisabled}</p><button disabled className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-50">{t.nextStep}</button></div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">{t.tabs.queue}</h2><span className="text-xs text-slate-400">{completedCount} {t.completedSuffix}</span></div>
            <div className="mt-3 space-y-2">
              {activeWorkOrders.slice(0, 6).map((work, index) => (
                <Link key={work.id} href={`/verk/${work.id}`} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${work.status === "COMPLETED" ? "bg-emerald-100 text-emerald-700" : work.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{work.status === "COMPLETED" ? "✓" : index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{work.title}</span>
                  <span className={`text-[11px] ${work.readyToClose ? "font-semibold text-amber-700" : "text-slate-400"}`}>{work.readyToClose ? t.readyToCloseBadge : work10StatusText(work.status, data.language)}</span>
                </Link>
              ))}
              {activeWorkOrders.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">{t.noWorkToShow}</p>}
            </div>
          </div>

          {machinesEnabled && (
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-slate-950">{t.tabs.machines}</h2>
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-700"
                  onClick={() => setMainTab("machines")}
                >
                  {t.seeAll}
                </button>
              </div>
              {machineResourceCount === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed bg-slate-50 p-5 text-sm leading-6 text-slate-500">{t.machinesEmpty}</div>
              ) : (
                <div className="mt-4 space-y-2">
                  {data.resources.filter((resource) => ["MACHINE", "VEHICLE", "TOOL"].includes(resource.kind)).slice(0, 5).map((resource) => (
                    <Link key={resource.id} href="/verk/tilfong" className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 hover:bg-slate-50">
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{resource.name}</p><p className="text-xs text-slate-500">{workResourceKindText(resource.kind, data.language)} · {resource.code}</p></div>
                      <span className="shrink-0 text-xs font-semibold text-slate-600">{workResourceStatusText(resource.status, data.language)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between"><h2 className="font-bold text-slate-950">{t.todayStatus}</h2><span className="text-[11px] text-slate-400">{t.currentData}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-blue-50 p-3"><p className="text-2xl font-bold text-blue-700">{inProgressCount}</p><p className="text-xs text-blue-700">{t.worksInProgress}</p></div>
                <div className="rounded-xl bg-red-50 p-3"><p className="text-2xl font-bold text-red-700">{newCount}</p><p className="text-xs text-red-700">{t.newWorks}</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-bold text-emerald-700">{uniqueLoggedPeople}/{data.people.length}</p><p className="text-xs text-emerald-700">{t.peopleWithTimeToday}</p></div>
                {machinesEnabled && (
                  <div className="rounded-xl bg-slate-100 p-3">
                    <p className="text-2xl font-bold text-slate-700">{machineResourceCount}</p>
                    <p className="text-xs text-slate-600">{t.machinesConnected}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="font-bold text-slate-950">{t.quickActions}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold">
                <Link href="/verk/nytt" className="rounded-xl border px-3 py-3 text-center text-blue-700 hover:bg-blue-50">＋ {t.newWork}</Link>
                <button disabled className="rounded-xl border px-3 py-3 text-slate-400">☷ {t.newQueue}</button>
                <Link href="/starfsmenn" className="rounded-xl border px-3 py-3 text-center text-blue-700 hover:bg-blue-50">＋ {t.addEmployee}</Link>
                <Link href="/verk/tilfong" className="rounded-xl border px-3 py-3 text-center text-violet-700 hover:bg-violet-50">＋ {resourceT.manageResources}</Link>
                <button type="button" onClick={() => setMainTab("map")} className="rounded-xl border px-3 py-3 text-blue-700 hover:bg-blue-50">⌖ {t.viewMap}</button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {staffingWork ? (() => {
        const deficit = staffingDeficit(staffingWork, data.people);
        const requiredCodes = requiredQualificationCodesForWork(staffingWork);
        const resources = assignedResourcesForWork(staffingWork);
        const blockedResources = blockedResourcesForWork(staffingWork);
        const visibleCandidates = staffingCandidates.slice(0, 8);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{t.staffingAction}</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{staffingWork.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">#{staffingWork.workNumber} · {work10PriorityText(staffingWork.priority, data.language)} · {assignedPeopleCount(staffingWork)}/{staffingWork.requiredPeople} {t.assignedShort}</p>
                </div>
                <button type="button" onClick={() => setStaffingWorkId(null)} className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{t.close}</button>
              </div>

              <div className="max-h-[calc(92vh-100px)] overflow-y-auto p-5">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-700">{t.staffingNeedsAttention}</p>
                    <p className="mt-1 text-2xl font-bold text-amber-950">{deficit}</p>
                  </div>
                  <div className="rounded-xl border bg-slate-50 p-4">
                    <p className="text-xs font-semibold text-slate-500">{t.staffingRequiredSkills}</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{requiredCodes.length > 0 ? requiredCodes.join(" · ") : t.staffingQualificationUnknown}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${blockedResources.length > 0 ? "border-red-200 bg-red-50" : "bg-slate-50"}`}>
                    <p className={`text-xs font-semibold ${blockedResources.length > 0 ? "text-red-700" : "text-slate-500"}`}>{t.staffingResources}</p>
                    <p className={`mt-1 text-sm font-bold ${blockedResources.length > 0 ? "text-red-900" : "text-slate-900"}`}>{resources.length > 0 ? resources.map((resource) => `${resource.name} (${workResourceStatusText(resource.status, data.language)})`).join(" · ") : "—"}</p>
                    {blockedResources.length > 0 ? <p className="mt-1 text-xs font-semibold text-red-700">{t.staffingBlockedResource}</p> : null}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-blue-950">{t.staffingTeamSuggestion}</h3>
                      <p className="mt-1 text-xs leading-5 text-blue-800">{t.staffingTopCandidatesHelp}</p>
                    </div>
                    {staffingTeamSuggestion.length > 0 ? (
                      <button type="button" disabled={bulkAssignmentBusy || blockedResources.length > 0} onClick={() => void assignCandidatesToWork(staffingWork, staffingTeamSuggestion)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{t.staffingApplyTeamSuggestion} ({staffingTeamSuggestion.length})</button>
                    ) : null}
                  </div>
                  {staffingTeamSuggestion.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {staffingTeamSuggestion.map((candidate) => {
                        const learnedPairing = staffingTeamSuggestion.reduce(
                          (sum, other) => other.person.id === candidate.person.id ? sum : sum + pairingCountForEmployees(candidate.person.id, other.person.id),
                          candidate.pairingCount,
                        );
                        return <span key={`${candidate.position.key}-${candidate.person.id}`} className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-900">{staffingRoleLabel(candidate.position.roleCode)} · {candidate.person.name}{learnedPairing > 0 ? ` · ${t.staffingHistory} ${learnedPairing}×` : ""}</span>;
                      })}
                    </div>
                  ) : <p className="mt-3 text-sm text-blue-800">{t.staffingNoSafeSuggestion}</p>}
                </div>

                <div className="mt-5">
                  <h3 className="text-sm font-bold text-slate-900">{t.staffingTopCandidates}</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {visibleCandidates.map((candidate) => {
                      const qualificationLabel = candidate.qualificationMatch === "matched"
                        ? t.staffingQualificationMatch
                        : candidate.qualificationMatch === "partial"
                          ? t.staffingQualificationPartial
                          : candidate.qualificationMatch === "missing"
                            ? t.staffingQualificationMissing
                            : t.staffingQualificationUnknown;
                      const canAssign = candidate.availability === "available" && candidate.qualificationMatch !== "missing" && blockedResources.length === 0;
                      return (
                        <div key={candidate.person.id} className={`rounded-xl border p-4 ${canAssign ? "bg-white" : "bg-slate-50"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-950">{candidate.person.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{candidate.person.jobTitle ?? t.roles.DEFAULT}{candidate.person.department ? ` · ${candidate.person.department}` : ""}</p>
                            </div>
                            <button type="button" disabled={!canAssign || bulkAssignmentBusy} onClick={() => void assignCandidatesToWork(staffingWork, [candidate])} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-40">{t.assignPersonAction}</button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-700">{staffingRoleLabel(candidate.position.roleCode)}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${candidate.availability === "available" ? "bg-emerald-100 text-emerald-700" : candidate.availability === "working" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{candidate.availability === "available" ? t.available : candidate.availability === "working" ? t.working : t.assigned}</span>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${candidate.qualificationMatch === "matched" ? "bg-emerald-100 text-emerald-700" : candidate.qualificationMatch === "missing" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{qualificationLabel}</span>
                            {candidate.matchedQualificationCodes.map((code) => <span key={code} className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700">{code}</span>)}
                          </div>
                          <p className="mt-3 text-[11px] leading-5 text-slate-500">{candidate.reasons.join(" · ")}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {periodStaffingOpen ? (() => {
        const workById = new Map(activeWorkOrders.map((work) => [work.id, work] as const));
        const personById = new Map(data.people.map((person) => [person.id, person] as const));
        const autoPlanningPeople = data.people.filter((person) => person.workExecutionMode !== "SELF_DIRECTED");
        const plannedWorkIds = new Set(periodPlan.flatMap((day) => day.plan.map((item) => item.workId)));
        const remainingWorks = activeWorkOrders.filter((work) =>
          !work.readyToClose &&
          staffingDeficit(work, data.people) > 0 &&
          !plannedWorkIds.has(work.id) &&
          !work.plannedDate,
        );
        const remainingBacklogCount = remainingWorks.length;
        const periodRows = periodPlanningBusy ? [] : periodPlan.map((day) => {
          const dayLabor = dayLaborForDate(day.dateIso);
          const scheduledWorks = scheduledWorksForDate(day.dateIso);
          const availablePeople = autoPlanningPeople.filter((person) =>
            personAvailabilityAtMinuteForDay(person.id, morningMinute, day.dateIso, dayLabor, scheduledWorks) === "available",
          );
          const capacityMinutes = availablePeople.reduce((sum, person) => {
            const workdayEnd = workdayEndForPerson(person);
            const grossMinutes = Math.max(0, workdayEnd - morningMinute);
            const breakMinutes = workdayBreaksForPerson(person)
              .filter((pause) => pause.targetStartMinutes >= morningMinute && pause.targetStartMinutes < workdayEnd)
              .reduce((breakSum, pause) => breakSum + pause.durationMinutes, 0);
            return sum + Math.max(0, grossMinutes - breakMinutes);
          }, 0);
          const workMinutes = day.plan.reduce((sum, item) => {
            const work = workById.get(item.workId);
            const person = personById.get(item.employeeId);
            if (!work?.estimatedMinutes || !person) return sum;
            return sum + Math.min(work.estimatedMinutes, Math.max(0, workdayEndForPerson(person) - item.plannedStartMinutes));
          }, 0);
          const travelMinutes = day.plan.reduce((sum, item) => sum + Math.max(0, item.travelMinutes) + Math.max(0, item.returnMinutes), 0);
          const usedMinutes = Math.min(capacityMinutes, workMinutes + travelMinutes);
          return {
            ...day,
            workCount: new Set(day.plan.map((item) => item.workId)).size,
            employeeCount: new Set(day.plan.map((item) => item.employeeId)).size,
            utilization: capacityMinutes > 0 ? Math.round((usedMinutes / capacityMinutes) * 100) : 0,
            capacityMinutes,
            workMinutes,
            travelMinutes,
            unusedMinutes: Math.max(0, capacityMinutes - usedMinutes),
          };
        });
        const totalWorkCount = plannedWorkIds.size;
        const totalAssignments = periodPlan.reduce((sum, day) => sum + day.plan.length, 0);
        const selectedPeriodRow = periodRows.find((day) => day.dateIso === periodDetailDateIso) ?? periodRows[0] ?? null;
        const visibleDayCount = periodPlanningBusy ? periodPlanningTotalDays : periodPlan.length;

        const remainingDiagnostics = periodPlanningBusy ? null : (() => {
          type RemainingReason = "DATA" | "RESOURCE" | "DEPARTMENT" | "QUALIFICATION" | "TEAM" | "DEADLINE" | "LOAD" | "TRAVEL_END" | "PLANNER";
          const reasonLabel: Record<RemainingReason, string> = {
            DATA: t.staffingPeriodReasonData,
            RESOURCE: t.staffingPeriodReasonResource,
            DEPARTMENT: t.staffingPeriodReasonDepartment,
            QUALIFICATION: t.staffingPeriodReasonQualification,
            TEAM: t.staffingPeriodReasonTeam,
            DEADLINE: t.staffingPeriodReasonDeadline,
            LOAD: t.staffingPeriodReasonLoad,
            TRAVEL_END: t.staffingPeriodReasonTravelEnd,
            PLANNER: t.staffingPeriodReasonPlanner,
          };
          const reasonCounts = new Map<RemainingReason, number>();
          const departmentCounts = new Map<string, number>();
          const qualificationCounts = new Map<string, number>();

          const dayStateByDate = new Map(periodPlan.map((day) => {
            const byPerson = new Map<number, {
              capacityMinutes: number;
              usedMinutes: number;
              usedWithoutReturnMinutes: number;
              availableAtMinutes: number;
              currentLocationId: number | null;
              takenBreakCodes: Set<string>;
              initiallyAvailable: boolean;
            }>();
            const dayLabor = dayLaborForDate(day.dateIso);
            const scheduledWorks = scheduledWorksForDate(day.dateIso);

            for (const person of autoPlanningPeople) {
              const workplace = workdayProfileForPerson(person);
              const fullDayStart = workplace?.dayStartMinutes ?? morningMinute;
              const fullDayEnd = workdayEndForPerson(person);
              const breakMinutes = workdayBreaksForPerson(person)
                .filter((pause) => pause.targetStartMinutes >= fullDayStart && pause.targetStartMinutes < fullDayEnd)
                .reduce((sum, pause) => sum + pause.durationMinutes, 0);
              const items = day.plan
                .filter((item) => item.employeeId === person.id)
                .slice()
                .sort((left, right) => (left.projectedAvailableMinutes ?? left.projectedEndMinutes ?? left.plannedStartMinutes) - (right.projectedAvailableMinutes ?? right.projectedEndMinutes ?? right.plannedStartMinutes));
              const lastItem = items.length > 0 ? items[items.length - 1] : null;
              const workMinutes = items.reduce((sum, item) => sum + Math.max(0, workById.get(item.workId)?.estimatedMinutes ?? 0), 0);
              const outboundMinutes = items.reduce((sum, item) => sum + Math.max(0, item.travelMinutes), 0);
              const finalReturnMinutes = Math.max(0, lastItem?.returnMinutes ?? 0);
              const usedMinutes = workMinutes + outboundMinutes + finalReturnMinutes;
              const takenBreakCodes = new Set<string>();
              items.forEach((item) => item.projectedBreaks.forEach((pause) => takenBreakCodes.add(pause.code)));
              const availableAtMinutes = lastItem?.projectedAvailableMinutes ?? lastItem?.projectedEndMinutes ?? morningMinute;
              workdayBreaksForPerson(person)
                .filter((pause) => pause.targetStartMinutes < availableAtMinutes)
                .forEach((pause) => takenBreakCodes.add(pause.code));
              const currentLocationId = lastItem
                ? lastItem.travelToLocationId ?? workById.get(lastItem.workId)?.operationalLocationId ?? person.baseOperationalLocationId
                : person.baseOperationalLocationId;
              byPerson.set(person.id, {
                capacityMinutes: Math.max(1, fullDayEnd - fullDayStart - breakMinutes),
                usedMinutes,
                usedWithoutReturnMinutes: Math.max(0, usedMinutes - finalReturnMinutes),
                availableAtMinutes,
                currentLocationId: currentLocationId ?? null,
                takenBreakCodes,
                initiallyAvailable: personAvailabilityAtMinuteForDay(person.id, morningMinute, day.dateIso, dayLabor, scheduledWorks) === "available",
              });
            }
            return [day.dateIso, byPerson] as const;
          }));

          const canCoverDistinctPositions = (candidateIdsByPosition: number[][]) => {
            const ordered = candidateIdsByPosition.slice().sort((left, right) => left.length - right.length);
            const used = new Set<number>();
            const visit = (index: number): boolean => {
              if (index >= ordered.length) return true;
              for (const employeeId of ordered[index]) {
                if (used.has(employeeId)) continue;
                used.add(employeeId);
                if (visit(index + 1)) return true;
                used.delete(employeeId);
              }
              return false;
            };
            return visit(0);
          };

          const hardCandidatesForWork = (work: WorkOrderData, positions: StaffingPosition[]) => {
            const assignedHere = new Set(assignedEmployeeIdsForWork(work));
            const resourceCodes = assignedResourcesForWork(work)
              .map((resource) => resource.qualificationCode)
              .filter((code): code is string => Boolean(code));
            return positions.map((position) => {
              const requiredCodes = uniqueQualificationCodes([
                ...position.requiredQualificationCodes,
                ...(position.roleCode === "ASSISTANT" ? [] : resourceCodes),
              ]);
              requiredCodes.forEach((code) => qualificationCounts.set(code, (qualificationCounts.get(code) ?? 0) + 1));
              return autoPlanningPeople
                .filter((person) => !assignedHere.has(person.id))
                .filter((person) => departmentAllowsPerson(person, work))
                .filter((person) => {
                  const scope = workScopeMatchForPerson(person, position);
                  return scope !== "blocked" && scope !== "incidental_manual";
                })
                .filter((person) => !position.staffingRoleId || person.staffingRoleIds.includes(position.staffingRoleId))
                .filter((person) => {
                  if (requiredCodes.length === 0) return true;
                  const codes = new Set(person.qualificationCodes.map((code) => code.toUpperCase()));
                  return requiredCodes.every((code) => codes.has(code));
                })
                .map((person) => person.id);
            });
          };

          const dayFitsEmployee = (work: WorkOrderData, person: PersonData, dateIso: string, includeTravel: boolean) => {
            const state = dayStateByDate.get(dateIso)?.get(person.id);
            if (!state || (!state.initiallyAvailable && state.usedMinutes === 0)) return false;
            const maxUsedMinutes = Math.floor(state.capacityMinutes * (EMPLOYEE_LOAD_HARD_MAX_PERCENT / 100));
            const estimatedWorkMinutes = Math.max(0, work.estimatedMinutes ?? 0);
            if (!includeTravel) return state.usedWithoutReturnMinutes + estimatedWorkMinutes <= maxUsedMinutes;

            const outbound = travelEstimateFor(state.currentLocationId, work.operationalLocationId, state.availableAtMinutes, dateIso);
            if (state.currentLocationId && work.operationalLocationId && !outbound) return false;
            const workStartMinutes = roundUpToFiveMinutes(state.availableAtMinutes + (outbound?.travelMinutes ?? 0));
            const projection = projectWorkWindowWithBreaks({
              startMinutes: workStartMinutes,
              workMinutes: estimatedWorkMinutes,
              breaks: workdayBreaksForPerson(person),
              alreadyTakenBreakCodes: state.takenBreakCodes,
            });
            const effectiveEnd = projectionAvailabilityEnd(projection) ?? projection.endMinutes;
            const deadlineAbsolute = completionDeadlineAbsoluteMinutes(work);
            const workEndAbsolute = selectedAbsoluteMinutes(dateIso, projection.endMinutes);
            if (deadlineAbsolute !== null && workEndAbsolute !== null && workEndAbsolute > deadlineAbsolute) return false;

            let returnMinutes = 0;
            let arrivalAtBase = effectiveEnd;
            if (work.operationalLocationId && person.baseOperationalLocationId) {
              const back = travelEstimateFor(work.operationalLocationId, person.baseOperationalLocationId, effectiveEnd, dateIso);
              if (!back) return false;
              returnMinutes = back.travelMinutes;
              arrivalAtBase = effectiveEnd + returnMinutes;
            }
            const normalEnd = workdayEndForPerson(person);
            const sameDayDeadline = work.completionDeadlineDate === dateIso && work.completionDeadlineMinutes !== null
              ? work.completionDeadlineMinutes
              : null;
            const allowedEnd = work.allowAfterWorkdayEnd
              ? Math.min(24 * 60, Math.max(normalEnd + 4 * 60, sameDayDeadline ?? normalEnd))
              : normalEnd;
            if (arrivalAtBase > allowedEnd) return false;

            const projectedUsed = state.usedWithoutReturnMinutes + (outbound?.travelMinutes ?? 0) + estimatedWorkMinutes + returnMinutes;
            return projectedUsed <= maxUsedMinutes;
          };

          const diagnose = (work: WorkOrderData): RemainingReason => {
            const departmentName = work.responsibleDepartmentName ?? t.unknown;
            departmentCounts.set(departmentName, (departmentCounts.get(departmentName) ?? 0) + 1);

            const part = staffingPartForWork(work);
            if (!part?.persistedInWork10 || !work.estimatedMinutes || work.estimatedMinutes <= 0) return "DATA";
            if (blockedResourcesForWork(work).length > 0) return "RESOURCE";
            const positions = openStaffingPositionsForWork(work, data.people);
            if (positions.length === 0) return "DATA";

            const assignedHere = new Set(assignedEmployeeIdsForWork(work));
            const departmentPeople = autoPlanningPeople.filter((person) => !assignedHere.has(person.id) && departmentAllowsPerson(person, work));
            if (departmentPeople.length === 0) return "DEPARTMENT";

            const hardCandidateIds = hardCandidatesForWork(work, positions);
            if (hardCandidateIds.some((candidateIds) => candidateIds.length === 0)) return "QUALIFICATION";
            if (!canCoverDistinctPositions(hardCandidateIds)) return "TEAM";

            const deadlineDateOrdinal = work.completionDeadlineDate ? isoDateOrdinal(work.completionDeadlineDate) : null;
            const eligibleDays = periodPlan.filter((day) => {
              const dayOrdinal = isoDateOrdinal(day.dateIso);
              return deadlineDateOrdinal === null || dayOrdinal === null || dayOrdinal <= deadlineDateOrdinal;
            });
            if (eligibleDays.length === 0) return "DEADLINE";

            const canFitLoadOnAnyDay = eligibleDays.some((day) => canCoverDistinctPositions(
              hardCandidateIds.map((candidateIds) => candidateIds.filter((employeeId) => {
                const person = personById.get(employeeId);
                return Boolean(person && dayFitsEmployee(work, person, day.dateIso, false));
              })),
            ));
            if (!canFitLoadOnAnyDay) return "LOAD";

            const canFitTravelAndEndOnAnyDay = eligibleDays.some((day) => canCoverDistinctPositions(
              hardCandidateIds.map((candidateIds) => candidateIds.filter((employeeId) => {
                const person = personById.get(employeeId);
                return Boolean(person && dayFitsEmployee(work, person, day.dateIso, true));
              })),
            ));
            if (!canFitTravelAndEndOnAnyDay) return "TRAVEL_END";
            return "PLANNER";
          };

          for (const work of remainingWorks) {
            const reason = diagnose(work);
            reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
          }

          const reasonOrder: RemainingReason[] = ["QUALIFICATION", "DEPARTMENT", "TEAM", "LOAD", "TRAVEL_END", "DEADLINE", "RESOURCE", "DATA", "PLANNER"];
          return {
            reasons: reasonOrder
              .map((reason) => ({ reason, label: reasonLabel[reason], count: reasonCounts.get(reason) ?? 0 }))
              .filter((row) => row.count > 0),
            departments: [...departmentCounts.entries()]
              .map(([name, count]) => ({ name, count }))
              .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
              .slice(0, 10),
            qualifications: [...qualificationCounts.entries()]
              .map(([code, count]) => ({ code, count }))
              .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
              .slice(0, 10),
          };
        })();

        const departmentCapacityRows = periodPlanningBusy ? [] : (() => {
          type DepartmentCapacityAccumulator = {
            key: string;
            name: string;
            employeeIds: Set<number>;
            employeeDays: number;
            capacityMinutes: number;
            workMinutes: number;
            travelMinutes: number;
            plannedWorkIds: Set<number>;
            remainingWorkIds: Set<number>;
          };

          const rows = new Map<string, DepartmentCapacityAccumulator>();
          const departmentKey = (departmentId: number | null, departmentName: string | null) =>
            departmentId ? `id:${departmentId}` : `name:${(departmentName ?? t.unknown).trim().toLocaleLowerCase()}`;
          const ensureRow = (departmentId: number | null, departmentName: string | null) => {
            const key = departmentKey(departmentId, departmentName);
            const existing = rows.get(key);
            if (existing) return existing;
            const created: DepartmentCapacityAccumulator = {
              key,
              name: departmentName?.trim() || t.unknown,
              employeeIds: new Set<number>(),
              employeeDays: 0,
              capacityMinutes: 0,
              workMinutes: 0,
              travelMinutes: 0,
              plannedWorkIds: new Set<number>(),
              remainingWorkIds: new Set<number>(),
            };
            rows.set(key, created);
            return created;
          };

          for (const day of periodPlan) {
            const dayLabor = dayLaborForDate(day.dateIso);
            const scheduledWorks = scheduledWorksForDate(day.dateIso);

            for (const person of autoPlanningPeople) {
              if (personAvailabilityAtMinuteForDay(person.id, morningMinute, day.dateIso, dayLabor, scheduledWorks) !== "available") continue;
              const workdayEnd = workdayEndForPerson(person);
              const grossMinutes = Math.max(0, workdayEnd - morningMinute);
              const breakMinutes = workdayBreaksForPerson(person)
                .filter((pause) => pause.targetStartMinutes >= morningMinute && pause.targetStartMinutes < workdayEnd)
                .reduce((sum, pause) => sum + pause.durationMinutes, 0);
              const capacityMinutes = Math.max(0, grossMinutes - breakMinutes);
              if (capacityMinutes <= 0) continue;
              const row = ensureRow(person.departmentId, person.department);
              row.employeeIds.add(person.id);
              row.employeeDays += 1;
              row.capacityMinutes += capacityMinutes;
            }

            for (const item of day.plan) {
              const person = personById.get(item.employeeId);
              const work = workById.get(item.workId);
              if (!person || !work) continue;
              const row = ensureRow(
                work.responsibleDepartmentId ?? person.departmentId,
                work.responsibleDepartmentName ?? person.department,
              );
              row.employeeIds.add(person.id);
              row.plannedWorkIds.add(item.workId);
              row.workMinutes += Math.max(0, work.estimatedMinutes ?? 0);
              row.travelMinutes += Math.max(0, item.travelMinutes) + Math.max(0, item.returnMinutes);
            }
          }

          for (const work of remainingWorks) {
            const row = ensureRow(work.responsibleDepartmentId, work.responsibleDepartmentName);
            row.remainingWorkIds.add(work.id);
          }

          return [...rows.values()]
            .map((row) => {
              const usedMinutes = Math.min(row.capacityMinutes, row.workMinutes + row.travelMinutes);
              return {
                ...row,
                employeeCount: row.employeeIds.size,
                plannedWorkCount: row.plannedWorkIds.size,
                remainingWorkCount: row.remainingWorkIds.size,
                utilization: row.capacityMinutes > 0 ? Math.round((usedMinutes / row.capacityMinutes) * 100) : 0,
              };
            })
            .filter((row) => row.capacityMinutes > 0 || row.plannedWorkCount > 0 || row.remainingWorkCount > 0)
            .sort((left, right) =>
              right.remainingWorkCount - left.remainingWorkCount ||
              right.utilization - left.utilization ||
              left.name.localeCompare(right.name),
            );
        })();

        const periodEmployeeLoadRows = periodPlanningBusy ? [] : (() => {
          type EmployeePeriodLoadAccumulator = {
            person: PersonData;
            availableDays: number;
            capacityMinutes: number;
            workMinutes: number;
            travelMinutes: number;
            plannedWorkIds: Set<number>;
          };

          const rows = new Map<number, EmployeePeriodLoadAccumulator>();
          const ensureRow = (person: PersonData) => {
            const existing = rows.get(person.id);
            if (existing) return existing;
            const created: EmployeePeriodLoadAccumulator = {
              person,
              availableDays: 0,
              capacityMinutes: 0,
              workMinutes: 0,
              travelMinutes: 0,
              plannedWorkIds: new Set<number>(),
            };
            rows.set(person.id, created);
            return created;
          };

          for (const day of periodPlan) {
            const dayLabor = dayLaborForDate(day.dateIso);
            const scheduledWorks = scheduledWorksForDate(day.dateIso);

            for (const person of autoPlanningPeople) {
              if (personAvailabilityAtMinuteForDay(person.id, morningMinute, day.dateIso, dayLabor, scheduledWorks) !== "available") continue;
              const workdayEnd = workdayEndForPerson(person);
              const grossMinutes = Math.max(0, workdayEnd - morningMinute);
              const breakMinutes = workdayBreaksForPerson(person)
                .filter((pause) => pause.targetStartMinutes >= morningMinute && pause.targetStartMinutes < workdayEnd)
                .reduce((sum, pause) => sum + pause.durationMinutes, 0);
              const capacityMinutes = Math.max(0, grossMinutes - breakMinutes);
              if (capacityMinutes <= 0) continue;
              const row = ensureRow(person);
              row.availableDays += 1;
              row.capacityMinutes += capacityMinutes;
            }

            for (const person of autoPlanningPeople) {
              const items = day.plan
                .filter((item) => item.employeeId === person.id)
                .slice()
                .sort((left, right) => (left.projectedAvailableMinutes ?? left.projectedEndMinutes ?? left.plannedStartMinutes) - (right.projectedAvailableMinutes ?? right.projectedEndMinutes ?? right.plannedStartMinutes));
              if (items.length === 0) continue;
              const row = ensureRow(person);
              const workdayEnd = workdayEndForPerson(person);
              for (const item of items) {
                const work = workById.get(item.workId);
                if (!work?.estimatedMinutes) continue;
                row.workMinutes += Math.min(work.estimatedMinutes, Math.max(0, workdayEnd - item.plannedStartMinutes));
                row.travelMinutes += Math.max(0, item.travelMinutes);
                row.plannedWorkIds.add(item.workId);
              }
              const lastItem = items[items.length - 1];
              row.travelMinutes += Math.max(0, lastItem.returnMinutes);
            }
          }

          return [...rows.values()]
            .filter((row) => row.capacityMinutes > 0)
            .map((row) => {
              const usedMinutes = Math.min(row.capacityMinutes, row.workMinutes + row.travelMinutes);
              return {
                ...row,
                usedMinutes,
                freeMinutes: Math.max(0, row.capacityMinutes - usedMinutes),
                workCount: row.plannedWorkIds.size,
                utilization: row.capacityMinutes > 0 ? Math.round((usedMinutes / row.capacityMinutes) * 100) : 0,
              };
            });
        })();
        const periodEmployeeTopRows = [...periodEmployeeLoadRows]
          .sort((left, right) => right.utilization - left.utilization || right.usedMinutes - left.usedMinutes || left.person.name.localeCompare(right.person.name))
          .slice(0, 15);
        const periodEmployeeBottomRows = [...periodEmployeeLoadRows]
          .sort((left, right) => left.utilization - right.utilization || left.usedMinutes - right.usedMinutes || left.person.name.localeCompare(right.person.name))
          .slice(0, 15);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-busy={periodPlanningBusy}>
            <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{t.staffingPeriodTitle}</p>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t.staffingPeriodPreview}</span>
                  </div>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">
                    {work10FormatDate(dateFromIsoDate(selectedDateIso), data.language)} · {visibleDayCount} {t.staffingPeriodDays.toLocaleLowerCase()}
                  </h2>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">{t.staffingPeriodHelp}</p>
                </div>
                <button type="button" onClick={() => setPeriodStaffingOpen(false)} className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{t.close}</button>
              </div>
              <div className="max-h-[calc(92vh-112px)] overflow-y-auto p-5">
                {periodPlanningBusy ? (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-indigo-950">{t.staffingPeriodTitle}</p>
                        <p className="mt-1 text-sm text-indigo-800">{t.calendar.day} {periodPlanningCompletedDays}/{periodPlanningTotalDays}</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-indigo-700">{periodPlanningTotalDays > 0 ? Math.round((periodPlanningCompletedDays / periodPlanningTotalDays) * 100) : 0}%</span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-indigo-100">
                      <div
                        className="h-full rounded-full bg-indigo-600 transition-[width] duration-200"
                        style={{ width: `${periodPlanningTotalDays > 0 ? Math.round((periodPlanningCompletedDays / periodPlanningTotalDays) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl bg-indigo-50 p-4"><p className="text-xs font-semibold text-indigo-700">{t.staffingPeriodPlannedWorks}</p><p className="mt-1 text-2xl font-bold text-indigo-950">{totalWorkCount}</p></div>
                      <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-700">{t.staffingMorningAssignments}</p><p className="mt-1 text-2xl font-bold text-blue-950">{totalAssignments}</p></div>
                      <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-700">{t.staffingPeriodRemainingWorks}</p><p className="mt-1 text-2xl font-bold text-amber-950">{remainingBacklogCount}</p></div>
                      <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-600">{t.staffingPeriodDays}</p><p className="mt-1 text-2xl font-bold text-slate-950">{periodRows.length}</p></div>
                    </div>

                    {remainingDiagnostics && remainingBacklogCount > 0 ? (
                      <div className="mt-5 rounded-xl border bg-slate-50/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-950">{t.staffingPeriodRemainingDiagnostics}</p>
                            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">{t.staffingPeriodRemainingDiagnosticsHelp}</p>
                          </div>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{remainingBacklogCount}</span>
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-3">
                          <div className="rounded-xl border bg-white p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t.staffingPeriodReasons}</p>
                            <div className="mt-2 space-y-2">
                              {remainingDiagnostics.reasons.map((row) => (
                                <div key={row.reason} className="flex items-center justify-between gap-3 text-sm">
                                  <span className="text-slate-700">{row.label}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-800">{row.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-xl border bg-white p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t.staffingPeriodDepartments}</p>
                            <div className="mt-2 space-y-2">
                              {remainingDiagnostics.departments.map((row) => (
                                <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                                  <span className="truncate text-slate-700">{row.name}</span>
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-800">{row.count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-xl border bg-white p-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t.staffingPeriodQualifications}</p>
                            {remainingDiagnostics.qualifications.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-500">{t.staffingPeriodNoQualificationPressure}</p>
                            ) : (
                              <div className="mt-2 space-y-2">
                                {remainingDiagnostics.qualifications.map((row) => (
                                  <div key={row.code} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="font-mono text-slate-700">{row.code}</span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-800">{row.count}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {departmentCapacityRows.length > 0 ? (
                      <div className="mt-5 rounded-xl border bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-950">{t.staffingPeriodDepartmentCapacity}</p>
                            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">{t.staffingPeriodDepartmentCapacityHelp}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{departmentCapacityRows.length}</span>
                        </div>
                        <div className="mt-4 overflow-x-auto rounded-xl border">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600">
                              <tr>
                                <th className="px-3 py-3 font-semibold">{t.staffingPeriodDepartment}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingAreaPeopleShort}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingPeriodAvailableCapacity}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingLoadWork}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingLoadTravel}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingMorningUtilization}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingPeriodPlannedWorksShort}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingPeriodRemainingWorksShort}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {departmentCapacityRows.map((row) => (
                                <tr key={row.key} className={row.remainingWorkCount > 0 && row.utilization < 80 ? "bg-amber-50/50" : undefined}>
                                  <td className="px-3 py-3 font-bold text-slate-900">{row.name}</td>
                                  <td className="px-3 py-3 text-slate-700">{row.employeeCount}</td>
                                  <td className="px-3 py-3 text-slate-700">{formatMinutesDuration(row.capacityMinutes, t.hoursShort, t.minutesShort)}</td>
                                  <td className="px-3 py-3 text-slate-700">{formatMinutesDuration(row.workMinutes, t.hoursShort, t.minutesShort)}</td>
                                  <td className="px-3 py-3 text-slate-700">{formatMinutesDuration(row.travelMinutes, t.hoursShort, t.minutesShort)}</td>
                                  <td className="px-3 py-3">
                                    <span className={`rounded-full px-2 py-1 font-bold ${row.utilization >= 85 ? "bg-emerald-50 text-emerald-800" : row.remainingWorkCount > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                                      {row.utilization}%
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-slate-700">{row.plannedWorkCount}</td>
                                  <td className="px-3 py-3">
                                    <span className={row.remainingWorkCount > 0 ? "rounded-full bg-amber-100 px-2 py-1 font-bold text-amber-800" : "text-slate-500"}>
                                      {row.remainingWorkCount}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}

                    {periodEmployeeLoadRows.length > 0 ? (
                      <div className="mt-5 rounded-xl border bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-slate-950">{t.staffingPeriodEmployeeLoad}</p>
                            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">{t.staffingPeriodEmployeeLoadHelp}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{periodEmployeeLoadRows.length}</span>
                        </div>
                        <div className="mt-4 grid gap-4 xl:grid-cols-2">
                          <div className="rounded-xl border bg-slate-50/50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{t.staffingPeriodEmployeeTopFifteen}</p>
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{periodEmployeeTopRows.length}</span>
                            </div>
                            <div className="mt-3 space-y-2">
                              {periodEmployeeTopRows.map((row) => (
                                <div key={row.person.id} className="rounded-lg border bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">{row.person.name}</p>
                                      <p className="truncate text-[11px] text-slate-500">{row.person.department ?? t.unknown}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${row.utilization >= 90 ? "bg-amber-100 text-amber-800" : row.utilization >= 80 ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{row.utilization}%</span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {t.staffingLoadWork}: {formatMinutesDuration(row.workMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadTravel}: {formatMinutesDuration(row.travelMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadBuffer}: {formatMinutesDuration(row.freeMinutes, t.hoursShort, t.minutesShort)} · {row.workCount} {t.staffingAreaWorksShort}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-xl border bg-slate-50/50 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{t.staffingPeriodEmployeeBottomFifteen}</p>
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">{periodEmployeeBottomRows.length}</span>
                            </div>
                            <div className="mt-3 space-y-2">
                              {periodEmployeeBottomRows.map((row) => (
                                <div key={row.person.id} className="rounded-lg border bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-semibold text-slate-900">{row.person.name}</p>
                                      <p className="truncate text-[11px] text-slate-500">{row.person.department ?? t.unknown}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${row.utilization === 0 ? "bg-slate-100 text-slate-700" : "bg-sky-100 text-sky-800"}`}>{row.utilization}%</span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-500">
                                    {t.staffingLoadWork}: {formatMinutesDuration(row.workMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadTravel}: {formatMinutesDuration(row.travelMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadBuffer}: {formatMinutesDuration(row.freeMinutes, t.hoursShort, t.minutesShort)} · {row.workCount} {t.staffingAreaWorksShort}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {totalWorkCount === 0 ? (
                      <p className="mt-5 rounded-xl border border-dashed p-6 text-sm text-slate-500">{t.staffingPeriodNoPlan}</p>
                    ) : (
                      <div className="mt-5 space-y-5">
                        <div className="overflow-x-auto rounded-xl border bg-white">
                          <table className="min-w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600">
                              <tr>
                                <th className="px-3 py-3 font-semibold">{t.dateLabel}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingAreaWorksShort}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingAreaPeopleShort}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingMorningAssignments}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingMorningUtilization}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingLoadWork}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingLoadTravel}</th>
                                <th className="px-3 py-3 font-semibold">{t.staffingLoadBuffer}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {periodRows.map((day) => {
                                const selected = selectedPeriodRow?.dateIso === day.dateIso;
                                return (
                                  <tr key={day.dateIso} className={selected ? "bg-indigo-50/70" : "hover:bg-slate-50"}>
                                    <td className="px-3 py-3">
                                      <button type="button" onClick={() => setPeriodDetailDateIso(day.dateIso)} className={`font-bold ${selected ? "text-indigo-700" : "text-slate-900 hover:text-indigo-700"}`}>
                                        {work10FormatDate(dateFromIsoDate(day.dateIso), data.language)}
                                      </button>
                                    </td>
                                    <td className="px-3 py-3 font-semibold text-slate-800">{day.workCount}</td>
                                    <td className="px-3 py-3 text-slate-700">{day.employeeCount}</td>
                                    <td className="px-3 py-3 text-slate-700">{day.plan.length}</td>
                                    <td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 font-bold text-emerald-800">{day.utilization}%</span></td>
                                    <td className="px-3 py-3 text-slate-700">{formatMinutesDuration(day.workMinutes, t.hoursShort, t.minutesShort)}</td>
                                    <td className="px-3 py-3 text-slate-700">{formatMinutesDuration(day.travelMinutes, t.hoursShort, t.minutesShort)}</td>
                                    <td className="px-3 py-3 text-slate-700">{formatMinutesDuration(day.unusedMinutes, t.hoursShort, t.minutesShort)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {selectedPeriodRow ? (
                          <div className="overflow-hidden rounded-xl border bg-white">
                            <div className="flex flex-col gap-3 border-b bg-slate-50 p-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="font-bold text-slate-950">{work10FormatDate(dateFromIsoDate(selectedPeriodRow.dateIso), data.language)}</p>
                                <p className="mt-1 text-xs text-slate-500">{selectedPeriodRow.workCount} {t.staffingAreaWorksShort} · {selectedPeriodRow.employeeCount} {t.staffingAreaPeopleShort} · {selectedPeriodRow.plan.length} {t.staffingMorningAssignments.toLocaleLowerCase()}</p>
                              </div>
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{t.staffingMorningUtilization}: {selectedPeriodRow.utilization}%</span>
                                <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">{t.staffingLoadWork}: {formatMinutesDuration(selectedPeriodRow.workMinutes, t.hoursShort, t.minutesShort)}</span>
                                <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">{t.staffingLoadTravel}: {formatMinutesDuration(selectedPeriodRow.travelMinutes, t.hoursShort, t.minutesShort)}</span>
                                <span className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">{t.staffingLoadBuffer}: {formatMinutesDuration(selectedPeriodRow.unusedMinutes, t.hoursShort, t.minutesShort)}</span>
                              </div>
                            </div>
                            <div className="p-3">
                              {selectedPeriodRow.plan.length === 0 ? (
                                <p className="rounded-lg border border-dashed bg-white p-4 text-sm text-slate-500">{t.staffingMorningNoPlan}</p>
                              ) : (
                                <div className="divide-y overflow-hidden rounded-lg border bg-white">
                                  {selectedPeriodRow.plan.map((item, index) => {
                                    const work = workById.get(item.workId);
                                    const person = personById.get(item.employeeId);
                                    if (!work || !person) return null;
                                    return (
                                      <div key={`${selectedPeriodRow.dateIso}-${item.workId}-${item.employeeId}-${index}`} className="grid gap-2 p-3 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                                        <div>
                                          <p className="font-semibold text-slate-900">{work.title}</p>
                                          <p className="text-xs text-slate-500">#{work.workNumber} · {work.responsibleDepartmentName ?? t.unknown}</p>
                                        </div>
                                        <div>
                                          <p className="text-sm font-semibold text-slate-800">{person.name}</p>
                                          <p className="text-xs text-slate-500">{staffingRoleLabel(item.roleCode)}{item.requiredQualificationCodes.length > 0 ? ` · ${item.requiredQualificationCodes.join(" + ")}` : ""}</p>
                                        </div>
                                        <div className="text-right text-xs text-slate-600">
                                          <p className="font-bold text-slate-900">{work10ClockFromMinutes(item.plannedStartMinutes)} → {work10ClockFromMinutes(item.projectedEndMinutes)}</p>
                                          <p>{item.travelMinutes > 0 ? `${item.travelMinutes} ${t.minutesShort} ${t.staffingAreaTravelShort}` : t.staffingTravelSameLocation}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })() : null}

      {morningStaffingOpen ? (() => {
        const usedEmployeeIds = new Set(morningPlan.map((item) => item.employeeId));
        const plannedWorkCount = new Set(morningPlan.map((item) => item.workId)).size;
        const remainingAfterPlan = Math.max(0, morningUnassignedPeopleCount - usedEmployeeIds.size);
        const availableAtPlanStart = data.people.filter((person) => personAvailabilityAtMinute(person.id, morningMinute) === "available");
        const normalCapacityMinutes = availableAtPlanStart.reduce((sum, person) => {
          const workdayEnd = workdayEndForPerson(person);
          const grossMinutes = Math.max(0, workdayEnd - morningMinute);
          const remainingBreakMinutes = workdayBreaksForPerson(person)
            .filter((pause) => pause.targetStartMinutes >= morningMinute && pause.targetStartMinutes < workdayEnd)
            .reduce((breakSum, pause) => breakSum + pause.durationMinutes, 0);
          return sum + Math.max(0, grossMinutes - remainingBreakMinutes);
        }, 0);
        const overlapInsideNormalDay = (person: PersonData, start: number | null, end: number | null) => {
          if (start === null || end === null || end <= start) return 0;
          const workdayEnd = workdayEndForPerson(person);
          return Math.max(0, Math.min(end, workdayEnd) - Math.max(start, morningMinute));
        };
        const productiveMinutes = morningPlan.reduce((sum, item) => {
          const work = activeWorkOrders.find((candidate) => candidate.id === item.workId);
          const person = data.people.find((candidate) => candidate.id === item.employeeId);
          if (!work?.estimatedMinutes || !person) return sum;
          const normalWindow = Math.max(0, workdayEndForPerson(person) - item.plannedStartMinutes);
          return sum + Math.min(work.estimatedMinutes, normalWindow);
        }, 0);
        const normalTravelMinutes = morningPlan.reduce((sum, item) => {
          const person = data.people.find((candidate) => candidate.id === item.employeeId);
          if (!person) return sum;
          const outbound = item.travelDepartureMinutes !== null
            ? overlapInsideNormalDay(person, item.travelDepartureMinutes, item.travelDepartureMinutes + item.travelMinutes)
            : 0;
          const back = item.returnDepartureMinutes !== null
            ? overlapInsideNormalDay(person, item.returnDepartureMinutes, item.returnDepartureMinutes + item.returnMinutes)
            : 0;
          return sum + outbound + back;
        }, 0);
        const usedNormalCapacityMinutes = Math.min(normalCapacityMinutes, productiveMinutes + normalTravelMinutes);
        const unusedCapacityMinutes = Math.max(0, normalCapacityMinutes - usedNormalCapacityMinutes);
        const utilizationPercent = normalCapacityMinutes > 0
          ? Math.round((usedNormalCapacityMinutes / normalCapacityMinutes) * 100)
          : 0;

        // Greining eingöngu: þessar mælingar breyta ekki úthlutunaralgríminu.
        // Markmiðið er að sjá hvort svæðisklösun spari ferðir án þess að fela
        // óraunhæft þétt dagsplan á einstaka starfsmenn.
        const workById = new Map(activeWorkOrders.map((work) => [work.id, work]));
        const employeeLoadAllRows = availableAtPlanStart
          .map((person) => {
            const items = morningPlan.filter((item) => item.employeeId === person.id);
            const workdayEnd = workdayEndForPerson(person);
            const grossMinutes = Math.max(0, workdayEnd - morningMinute);
            const remainingBreakMinutes = workdayBreaksForPerson(person)
              .filter((pause) => pause.targetStartMinutes >= morningMinute && pause.targetStartMinutes < workdayEnd)
              .reduce((sum, pause) => sum + pause.durationMinutes, 0);
            const capacityMinutes = Math.max(0, grossMinutes - remainingBreakMinutes);
            const workMinutes = items.reduce((sum, item) => {
              const work = workById.get(item.workId);
              if (!work?.estimatedMinutes) return sum;
              const normalWindow = Math.max(0, workdayEnd - item.plannedStartMinutes);
              return sum + Math.min(work.estimatedMinutes, normalWindow);
            }, 0);
            const travelMinutes = items.reduce((sum, item) => {
              const outbound = item.travelDepartureMinutes !== null
                ? overlapInsideNormalDay(person, item.travelDepartureMinutes, item.travelDepartureMinutes + item.travelMinutes)
                : 0;
              const back = item.returnDepartureMinutes !== null
                ? overlapInsideNormalDay(person, item.returnDepartureMinutes, item.returnDepartureMinutes + item.returnMinutes)
                : 0;
              return sum + outbound + back;
            }, 0);
            const usedMinutes = Math.min(capacityMinutes, workMinutes + travelMinutes);
            const freeMinutes = Math.max(0, capacityMinutes - usedMinutes);
            const utilization = capacityMinutes > 0 ? Math.round((usedMinutes / capacityMinutes) * 100) : 0;
            const workCount = new Set(items.map((item) => item.workId)).size;
            const locationChanges = items.filter((item) => item.travelMinutes > 0).length;
            const latestPlannedMinute = items.reduce((latest, item) => {
              const returnArrival = item.returnDepartureMinutes !== null
                ? item.returnDepartureMinutes + item.returnMinutes
                : null;
              return Math.max(latest, returnArrival ?? item.projectedAvailableMinutes ?? item.projectedEndMinutes ?? item.plannedStartMinutes);
            }, morningMinute);
            const overtimeMinutes = Math.max(0, latestPlannedMinute - workdayEnd);
            const flags: string[] = [];
            if (utilization >= EMPLOYEE_LOAD_DENSE_PERCENT) flags.push(t.staffingLoadFlagDense);
            if (usedMinutes > 0 && freeMinutes <= EMPLOYEE_LOAD_LOW_BUFFER_MINUTES) flags.push(t.staffingLoadFlagLowBuffer);
            if (travelMinutes >= EMPLOYEE_LOAD_HIGH_TRAVEL_MINUTES) flags.push(t.staffingLoadFlagHighTravel);
            if (locationChanges >= EMPLOYEE_LOAD_MANY_LOCATION_CHANGES) flags.push(t.staffingLoadFlagManyLocations);
            if (overtimeMinutes > 0) flags.push(t.staffingLoadFlagOvertime);
            return {
              person,
              utilization,
              workMinutes,
              travelMinutes,
              freeMinutes,
              workCount,
              locationChanges,
              overtimeMinutes,
              flags,
            };
          })
          .filter((row) => row.workMinutes > 0 || row.travelMinutes > 0);
        const employeeLoadRows = [...employeeLoadAllRows]
          .sort((a, b) => b.utilization - a.utilization || b.workMinutes - a.workMinutes || b.travelMinutes - a.travelMinutes)
          .slice(0, 5);
        const employeeLowLoadRows = [...employeeLoadAllRows]
          .filter((row) => row.utilization >= 1)
          .sort((a, b) => a.utilization - b.utilization || a.workMinutes - b.workMinutes || a.travelMinutes - b.travelMinutes)
          .slice(0, 10);

        type DispatchGroup = {
          employees: Set<number>;
          workIds: Set<number>;
          travelMinutes: number;
          distanceKm: number;
        };
        const dispatchesByLocation = new Map<number, { locationName: string; groups: Map<string, DispatchGroup> }>();
        for (const item of morningPlan) {
          if (
            item.travelMinutes < REGION_DIAGNOSTIC_MIN_TRAVEL_MINUTES ||
            item.travelFromLocationId === null ||
            item.travelToLocationId === null ||
            item.travelFromLocationId === item.travelToLocationId ||
            item.travelDepartureMinutes === null
          ) continue;
          const person = data.people.find((candidate) => candidate.id === item.employeeId);
          if (!person) continue;
          const row = dispatchesByLocation.get(item.travelToLocationId) ?? {
            locationName: item.travelToLocationName ?? t.unknown,
            groups: new Map<string, DispatchGroup>(),
          };
          const carrierKey = person.primaryFixedTeamId !== null ? `team:${person.primaryFixedTeamId}` : `person:${person.id}`;
          const groupKey = `${carrierKey}|${item.travelFromLocationId}|${item.travelToLocationId}|${item.travelDepartureMinutes}`;
          const group = row.groups.get(groupKey) ?? {
            employees: new Set<number>(),
            workIds: new Set<number>(),
            travelMinutes: 0,
            distanceKm: 0,
          };
          group.employees.add(person.id);
          group.workIds.add(item.workId);
          group.travelMinutes = Math.max(group.travelMinutes, item.travelMinutes);
          group.distanceKm = Math.max(group.distanceKm, item.travelDistanceKm);
          row.groups.set(groupKey, group);
          dispatchesByLocation.set(item.travelToLocationId, row);
        }
        const repeatedAreaDispatchRows = [...dispatchesByLocation.values()]
          .map((row) => {
            const groups = [...row.groups.values()];
            const employees = new Set(groups.flatMap((group) => [...group.employees]));
            const workIds = new Set(groups.flatMap((group) => [...group.workIds]));
            return {
              locationName: row.locationName,
              dispatchCount: groups.length,
              employeeCount: employees.size,
              workCount: workIds.size,
              travelMinutes: groups.reduce((sum, group) => sum + group.travelMinutes, 0),
              distanceKm: groups.reduce((sum, group) => sum + group.distanceKm, 0),
            };
          })
          .filter((row) => row.dispatchCount > 1)
          .sort((a, b) => b.dispatchCount - a.dispatchCount || b.travelMinutes - a.travelMinutes || a.locationName.localeCompare(b.locationName))
          .slice(0, 6);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true">
            <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{t.staffingMorningTitle}</p>
                  <h2 className="mt-1 text-2xl font-bold text-slate-950">{t.staffingMorningPlan} · {morningTimeInput}</h2>
                  <p className="mt-1 text-sm text-slate-500">{work10FormatDate(selectedDate, data.language)} · {t.staffingMorningPriorityHelp}</p>
                </div>
                <button type="button" onClick={() => setMorningStaffingOpen(false)} className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{t.close}</button>
              </div>
              <div className="max-h-[calc(92vh-100px)] overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl bg-indigo-50 p-4"><p className="text-xs font-semibold text-indigo-700">{t.staffingMorningAssignments}</p><p className="mt-1 text-2xl font-bold text-indigo-950">{plannedWorkCount}</p></div>
                  <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-700">{t.staffingMorningWorksNeedPeople}</p><p className="mt-1 text-2xl font-bold text-amber-950">{morningWorksNeedPeople.length}</p></div>
                  <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">{t.staffingMorningAssignedPeople}</p><p className="mt-1 text-2xl font-bold text-emerald-950">{usedEmployeeIds.size}</p></div>
                  <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-600">{t.staffingMorningUnassignedPeople}</p><p className="mt-1 text-2xl font-bold text-slate-950">{remainingAfterPlan}</p></div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border bg-white p-3"><p className="text-xs font-semibold text-slate-500">{t.staffingMorningUtilization}</p><p className="mt-1 text-xl font-bold text-slate-950">{utilizationPercent}%</p></div>
                  <div className="rounded-xl border bg-white p-3"><p className="text-xs font-semibold text-slate-500">{t.staffingMorningProductiveMinutes}</p><p className="mt-1 text-xl font-bold text-slate-950">{formatMinutesDuration(productiveMinutes, t.hoursShort, t.minutesShort)}</p></div>
                  <div className="rounded-xl border bg-white p-3"><p className="text-xs font-semibold text-slate-500">{t.staffingMorningTravelMinutes}</p><p className="mt-1 text-xl font-bold text-slate-950">{formatMinutesDuration(normalTravelMinutes, t.hoursShort, t.minutesShort)}</p></div>
                  <div className="rounded-xl border bg-white p-3"><p className="text-xs font-semibold text-slate-500">{t.staffingMorningUnusedMinutes}</p><p className="mt-1 text-xl font-bold text-slate-950">{formatMinutesDuration(unusedCapacityMinutes, t.hoursShort, t.minutesShort)}</p></div>
                </div>

                {morningPlan.length > 0 ? (
                  <div className="mt-5 grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-950">{t.staffingAreaDispatchDiagnostics}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{t.staffingAreaDispatchDiagnosticsHelp}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${repeatedAreaDispatchRows.length > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                          {repeatedAreaDispatchRows.length}
                        </span>
                      </div>
                      {repeatedAreaDispatchRows.length === 0 ? (
                        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">{t.staffingAreaDispatchDiagnosticsClear}</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {repeatedAreaDispatchRows.map((row) => (
                            <div key={row.locationName} className="rounded-lg border bg-slate-50 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">{row.locationName}</p>
                                <span className="text-xs font-bold text-amber-700">{row.dispatchCount} {t.staffingAreaDispatchesShort}</span>
                              </div>
                              <p className="mt-1 text-[11px] text-slate-500">
                                {row.workCount} {t.staffingAreaWorksShort} · {row.employeeCount} {t.staffingAreaPeopleShort} · {formatMinutesDuration(row.travelMinutes, t.hoursShort, t.minutesShort)} {t.staffingAreaTravelShort}
                                {row.distanceKm > 0 ? ` · ${row.distanceKm.toLocaleString(data.language === "is" ? "is-IS" : undefined, { maximumFractionDigits: 1 })} km` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-950">{t.staffingEmployeeLoadDiagnostics}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{t.staffingEmployeeLoadDiagnosticsHelp}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{t.staffingEmployeeLoadTopFive}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {employeeLoadRows.map((row) => (
                          <div key={row.person.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-semibold text-slate-900">{row.person.name}</p>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${row.flags.length > 0 ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{row.utilization}%</span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {t.staffingLoadWork}: {formatMinutesDuration(row.workMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadTravel}: {formatMinutesDuration(row.travelMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadBuffer}: {formatMinutesDuration(row.freeMinutes, t.hoursShort, t.minutesShort)} · {row.workCount} {t.staffingAreaWorksShort}
                            </p>
                            {row.flags.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {row.flags.map((flag) => <span key={flag} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{flag}</span>)}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border bg-white p-4 xl:col-span-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-950">{t.staffingEmployeeLoadBottomTen}</h3>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{t.staffingEmployeeLoadBottomTenHelp}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{employeeLowLoadRows.length}</span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {employeeLowLoadRows.map((row) => (
                          <div key={row.person.id} className="rounded-lg border bg-slate-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-sm font-semibold text-slate-900">{row.person.name}</p>
                              <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">{row.utilization}%</span>
                            </div>
                            <p className="mt-1 text-[11px] text-slate-500">
                              {t.staffingLoadWork}: {formatMinutesDuration(row.workMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadTravel}: {formatMinutesDuration(row.travelMinutes, t.hoursShort, t.minutesShort)} · {t.staffingLoadBuffer}: {formatMinutesDuration(row.freeMinutes, t.hoursShort, t.minutesShort)} · {row.workCount} {t.staffingAreaWorksShort}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {morningPlan.length === 0 ? (
                  <p className="mt-5 rounded-xl border border-dashed p-6 text-sm text-slate-500">{t.staffingMorningNoPlan}</p>
                ) : (
                  <div className="mt-5 overflow-hidden rounded-xl border">
                    <div className="divide-y">
                      {morningPlan.map((item, index) => {
                        const work = activeWorkOrders.find((candidate) => candidate.id === item.workId);
                        const person = data.people.find((candidate) => candidate.id === item.employeeId);
                        if (!work || !person) return null;
                        return (
                          <div key={`${item.workId}-${item.employeeId}-${index}`} className="grid gap-2 bg-white p-3 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                            <div>
                              <p className="font-semibold text-slate-900">{work.title}</p>
                              <p className="text-xs text-slate-500">{work10PriorityText(work.priority, data.language)} · #{work.workNumber}</p>
                              {work.responsibleDepartmentName ? (
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {t.staffingResponsibleDepartment}: {work.responsibleDepartmentName}
                                  {work.locationDepartmentName && work.locationDepartmentId !== work.responsibleDepartmentId
                                    ? ` · ${t.staffingLocationDepartment}: ${work.locationDepartmentName}`
                                    : ""}
                                </p>
                              ) : null}
                              {work.operationalLocationName ? (
                                <p className="mt-0.5 text-[11px] font-medium text-slate-600">{t.staffingWorkLocation}: {work.operationalLocationName}</p>
                              ) : null}
                              {work.completionDeadlineDate && work.completionDeadlineMinutes !== null ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-amber-700">{t.completionDeadline}: {work10FormatDate(dateFromIsoDate(work.completionDeadlineDate), data.language)} · {work10ClockFromMinutes(work.completionDeadlineMinutes)}</p>
                              ) : null}
                              {work.allowAfterWorkdayEnd ? (
                                <p className="mt-0.5 text-[11px] font-semibold text-rose-700">
                                  {t.staffingWorkdayEndException}{work.workdayEndExceptionReason ? ` · ${work.workdayEndExceptionReason}` : ""}
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{person.name}</p>
                              <p className="text-xs text-slate-500">{person.jobTitle ?? t.roles.DEFAULT} · {staffingRoleLabel(item.roleCode)}{item.requiredQualificationCodes.length > 0 ? ` · ${item.requiredQualificationCodes.join(" + ")}` : ""}</p>
                              {person.department ? (
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {t.staffingEmployeeDepartment}: {person.department}
                                  {person.fixedTeamNames.length > 0 ? ` · ${t.staffingReasonFixedTeam}: ${person.fixedTeamNames.join(", ")}` : ""}
                                </p>
                              ) : null}
                              {item.travelFromLocationId && item.travelToLocationId && item.travelDepartureMinutes !== null ? (
                                <p className="mt-1 text-[11px] text-sky-700">
                                  {t.staffingTravel}: {item.travelFromLocationName ?? t.unknown} → {item.travelToLocationName ?? t.unknown}
                                  {item.travelMinutes > 0
                                    ? ` · ${work10ClockFromMinutes(item.travelDepartureMinutes)} → ${work10ClockFromMinutes(item.travelDepartureMinutes + item.travelMinutes)} · ${item.travelMinutes} ${t.minutesShort} · ${item.travelDistanceKm.toLocaleString(data.language === "is" ? "is-IS" : undefined, { maximumFractionDigits: 1 })} km`
                                    : ` · ${t.staffingTravelSameLocation}`}
                                  {item.trafficRuleCode === "MORNING_PEAK" ? ` · ${t.staffingTravelMorningPeak}` : ""}
                                  {item.trafficRuleCode === "AFTERNOON_PEAK" ? ` · ${t.staffingTravelAfternoonPeak}` : ""}
                                </p>
                              ) : work.operationalLocationId ? (
                                <p className="mt-1 text-[11px] text-amber-700">{t.staffingTravelUnknown}</p>
                              ) : null}
                              {item.projectedEndMinutes !== null ? (
                                <p className="mt-1 text-[11px] text-slate-500">
                                  {work10ClockFromMinutes(item.plannedStartMinutes)} → {work10ClockFromMinutes(item.projectedEndMinutes)}
                                  {item.projectedBreaks.length > 0
                                    ? ` · ${item.projectedBreaks.map((pause) => `${pause.label} ${work10ClockFromMinutes(pause.startMinutes)} (+${pause.durationMinutes} ${t.minutesShort})`).join(" · ")}`
                                    : ""}
                                </p>
                              ) : null}
                              {item.returnFromLocationId && item.returnToLocationId && item.returnDepartureMinutes !== null ? (
                                <p className="mt-1 text-[11px] font-medium text-emerald-700">
                                  {t.returnToBase}: {item.returnFromLocationName ?? t.unknown} → {item.returnToLocationName ?? t.unknown}
                                  {item.returnMinutes > 0
                                    ? ` · ${work10ClockFromMinutes(item.returnDepartureMinutes)} → ${work10ClockFromMinutes(item.returnDepartureMinutes + item.returnMinutes)} · ${item.returnMinutes} ${t.minutesShort} · ${item.returnDistanceKm.toLocaleString(data.language === "is" ? "is-IS" : undefined, { maximumFractionDigits: 1 })} km`
                                    : ` · ${t.staffingTravelSameLocation}`}
                                  {item.returnTrafficRuleCode === "MORNING_PEAK" ? ` · ${t.staffingTravelMorningPeak}` : ""}
                                  {item.returnTrafficRuleCode === "AFTERNOON_PEAK" ? ` · ${t.staffingTravelAfternoonPeak}` : ""}
                                </p>
                              ) : null}
                              {item.fixedTeamMatchCount > 0 || item.dayTeamContinuityCount > 0 || item.workScopeMatch === "incidental_auto" ? (
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                  {item.fixedTeamMatchCount > 0 ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{t.staffingReasonFixedTeam}</span> : null}
                                  {item.dayTeamContinuityCount > 0 ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{t.staffingReasonDayTeam}</span> : null}
                                  {item.workScopeMatch === "incidental_auto" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{t.staffingReasonIncidentalAuto}</span> : null}
                                </div>
                              ) : null}
                            </div>
                            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{t.staffingCandidateScore}: {Math.round(item.score)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => setMorningStaffingOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">{t.close}</button>
                  <button type="button" disabled={bulkAssignmentBusy || morningPlan.length === 0} onClick={() => void applyMorningPlan()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{t.staffingMorningApply} ({plannedWorkCount})</button>
                </div>
              </div>
            </div>
          </div>
        );
      })() : null}

      {pendingAssignment ? (() => {
        const work = activeWorkOrders.find((item) => item.id === pendingAssignment.workId);
        const person = data.people.find((item) => item.id === pendingAssignment.employeeId);
        const openParts = work?.workParts.filter((part) => !isTerminalPartStatus(part.status)) ?? [];
        return work && person ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg rounded-2xl border bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div><h2 className="text-lg font-bold text-slate-950">{t.chooseWorkPartForAssignment}</h2><p className="mt-1 text-sm text-slate-600">{person.name} → {work.title}</p></div>
                <button type="button" onClick={() => setPendingAssignment(null)} className="rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">{t.close}</button>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600">{t.chooseWorkPartForAssignmentHelp}</p>
              <div className="mt-4 space-y-2">
                {openParts.map((part) => (
                  <button key={part.id} type="button" disabled={assignmentBusy} onClick={() => void assignEmployeeToPart(person.id, work, part)} className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50">
                    <span><strong className="block text-sm text-slate-900">{part.title}</strong><span className="text-xs text-slate-500">{work10StatusText(part.status, data.language)}</span></span>
                    <span className="text-sm font-semibold text-blue-700">{t.assignPersonAction}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null;
      })() : null}

      {selectedPerson ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-2xl border bg-white shadow-2xl">
            <div className="flex flex-col gap-4 border-b p-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.employeeHours}</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-950">{selectedPerson.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedPerson.jobTitle ?? t.roles.DEFAULT}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/starfsmenn/${selectedPerson.id}`} className="rounded-lg border px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{t.openEmployeeProfile}</Link>
                <button type="button" onClick={() => setSelectedPersonId(null)} className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{t.close}</button>
              </div>
            </div>
            <div className="overflow-y-auto p-5" style={{ maxHeight: "calc(88vh - 110px)" }}>
              <div className="flex flex-wrap gap-2">
                {(["day", "week", "month", "all"] as LaborPeriod[]).map((period) => (
                  <button key={period} type="button" onClick={() => setLaborPeriod(period)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${laborPeriod === period ? "bg-blue-600 text-white" : "border bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {period === "day" ? t.calendar.day : period === "week" ? t.calendar.week : period === "month" ? t.calendar.month : t.allPeriods}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-600">{t.totalHours}</p><p className="mt-1 text-2xl font-bold text-blue-900">{formatMinutesDuration(selectedPersonLaborMinutes, t.hoursShort, t.minutesShort)}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{t.timeEntries}</p><p className="mt-1 text-2xl font-bold text-slate-900">{selectedPersonLabor.length}</p></div>
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-500">{t.availabilityStatus}</p><p className="mt-1 text-sm font-bold text-slate-900">{activeEmployeeIds.has(selectedPerson.id) ? t.working : (personWorkRows.get(selectedPerson.id) ?? []).length > 0 ? t.assigned : t.available}</p></div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-500">{t.employeeHoursHelp}</p>
              {selectedPersonLabor.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed p-6 text-sm text-slate-500">{t.noHoursInPeriod}</div>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-xl border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">{t.dateLabel}</th><th className="px-3 py-3">{t.workLabel}</th><th className="px-3 py-3">{t.workPartLabel}</th><th className="px-3 py-3">{t.durationLabel}</th><th className="px-3 py-3">{t.registrationMethod}</th></tr></thead>
                    <tbody className="divide-y">
                      {selectedPersonLabor.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{new Date(entry.workDate).toLocaleDateString(data.language === "is" ? "is-IS" : data.language)}</td>
                          <td className="px-3 py-3">
                            {entry.workId !== null ? (
                              <Link href={`/verk/${entry.workId}`} className="font-semibold text-blue-700 hover:underline">{entry.workTitle}</Link>
                            ) : (
                              <span className="font-semibold text-slate-900">{entry.workTitle}</span>
                            )}
                            {entry.workNumber ? <div className="text-xs text-slate-400">#{entry.workNumber}</div> : null}
                          </td>
                          <td className="px-3 py-3 text-slate-600">{entry.workPartTitle ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">{formatMinutesDuration(entry.durationMinutes, t.hoursShort, t.minutesShort)}</td>
                          <td className="px-3 py-3 text-slate-600">{entry.source === "WORK_PART_FACT" ? t.workPartFactSource : entry.source === "EMPLOYEE_WORK_DIARY" ? t.diaryTimeSource : t.legacyTimeSource}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
