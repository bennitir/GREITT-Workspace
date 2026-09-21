import { prisma } from "../lib/prisma";

const COMPANY_NAME = "Próf ehf 2.";
const EMPLOYEE_PREFIX = "GLG-LT-EMP-20260920-";
const WORK_EXTERNAL_PREFIX = "GLG-LT-WORK-20260920-";
const RESOURCE_PREFIX = "GLG-LT-RES-20260920-";
const ASSIGNMENT_TAG = "GLG-LT-MACHINE-ASSIGN-20260920";
const TEST_MARKER = "[GLÖGGT MACHINE LOAD TEST 2026-09-20]";

const resources = [
  { code: "WL-01", kind: "MACHINE", name: "Volvo L30G hjólaskófla", qualification: "HJOLASKOFLA", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 1842.6, costRateIsk: 14500, saleRateIsk: 21500, status: "AVAILABLE" },
  { code: "EX-01", kind: "MACHINE", name: "CAT 302.7 CR smágröfa", qualification: "SMAGROFA", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 936.2, costRateIsk: 13200, saleRateIsk: 19900, status: "AVAILABLE" },
  { code: "SS-01", kind: "MACHINE", name: "Bobcat S650 skriðstýrð vinnuvél", qualification: "SKRIDSTYRD", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 2310.4, costRateIsk: 13800, saleRateIsk: 20500, status: "IN_USE" },
  { code: "FL-01", kind: "MACHINE", name: "Toyota Traigo 48 lyftari", qualification: "LYFTARI", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 4122.0, costRateIsk: 8200, saleRateIsk: 12900, status: "AVAILABLE" },
  { code: "TH-01", kind: "MACHINE", name: "Manitou MT 625 teleskóplyftari", qualification: "TELESKOPLYFTARI", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 1675.8, costRateIsk: 15900, saleRateIsk: 23900, status: "AVAILABLE" },
  { code: "TR-01", kind: "MACHINE", name: "John Deere 3038E dráttarvél", qualification: "DRATTARVEL", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 1277.9, costRateIsk: 10500, saleRateIsk: 16200, status: "AVAILABLE" },
  { code: "MW-01", kind: "MACHINE", name: "Husqvarna P 525DX sláttuvél", qualification: "SLATTUVEL", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 688.3, costRateIsk: 7600, saleRateIsk: 11800, status: "MAINTENANCE" },
  { code: "SW-01", kind: "MACHINE", name: "Kärcher MC 250 götusópur", qualification: "GOTUSOPUR", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 3441.1, costRateIsk: 17200, saleRateIsk: 25800, status: "AVAILABLE" },
  { code: "RL-01", kind: "MACHINE", name: "Bomag BW 120 vals", qualification: "VALS", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 1590.7, costRateIsk: 12800, saleRateIsk: 19100, status: "AVAILABLE" },
  { code: "BH-01", kind: "MACHINE", name: "JCB 3CX gröfu- og skófluvél", qualification: "GROFUSKOFLA", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 5066.5, costRateIsk: 18100, saleRateIsk: 26900, status: "AVAILABLE" },
  { code: "SV-01", kind: "VEHICLE", name: "Ford Transit þjónustubíll", qualification: "THJONUSTUBILL", baseUnit: "KM", meterUnit: "km", meterValue: 84210, costRateIsk: 145, saleRateIsk: 235, status: "AVAILABLE" },
  { code: "SV-02", kind: "VEHICLE", name: "Toyota Hilux 4x4 þjónustubíll", qualification: "THJONUSTUBILL", baseUnit: "KM", meterUnit: "km", meterValue: 116430, costRateIsk: 165, saleRateIsk: 260, status: "AVAILABLE" },
  { code: "PK-01", kind: "VEHICLE", name: "Iveco Daily pallbíll", qualification: "PALLBILL", baseUnit: "KM", meterUnit: "km", meterValue: 73480, costRateIsk: 195, saleRateIsk: 310, status: "AVAILABLE" },
  { code: "TL-01", kind: "VEHICLE", name: "Ifor Williams vélakerra", qualification: "VELAKERRA", baseUnit: "KM", meterUnit: null, meterValue: null, costRateIsk: 85, saleRateIsk: 145, status: "AVAILABLE" },
  { code: "PC-01", kind: "TOOL", name: "Wacker Neuson DPU 6555 plötuþjappa", qualification: "PLOTUTHJAPPA", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 412.5, costRateIsk: 4900, saleRateIsk: 7900, status: "AVAILABLE" },
  { code: "GN-01", kind: "TOOL", name: "Atlas Copco QAS 45 rafstöð", qualification: "RAFSTOD", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 2055.0, costRateIsk: 6100, saleRateIsk: 9800, status: "AVAILABLE" },
  { code: "PU-01", kind: "TOOL", name: "Honda WT40 vatnsdæla", qualification: "VATNSDAELA", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 287.4, costRateIsk: 3300, saleRateIsk: 5600, status: "AVAILABLE" },
  { code: "PW-01", kind: "TOOL", name: "Kärcher HDS 10/20 háþrýstiþvottavél", qualification: "HATHRYSTITHVOTTAVEL", baseUnit: "HOUR", meterUnit: "klst.", meterValue: 771.2, costRateIsk: 3900, saleRateIsk: 6400, status: "AVAILABLE" },
] as const;

type OperatorPlan = {
  employeeNo: number;
  title: string;
  qualificationCodes: string[];
};

const operators: OperatorPlan[] = [
  { employeeNo: 2, title: "Vélamaður – lyftari", qualificationCodes: ["LYFTARI", "TELESKOPLYFTARI"] },
  { employeeNo: 3, title: "Vélamaður – hjólaskófla", qualificationCodes: ["HJOLASKOFLA", "GROFUSKOFLA"] },
  { employeeNo: 5, title: "Vélamaður – gröfur", qualificationCodes: ["SMAGROFA", "SKRIDSTYRD"] },
  { employeeNo: 6, title: "Vélamaður – útisvæði", qualificationCodes: ["DRATTARVEL", "SLATTUVEL"] },
  { employeeNo: 9, title: "Vélamaður – götusópur", qualificationCodes: ["GOTUSOPUR"] },
  { employeeNo: 10, title: "Vélamaður – lager", qualificationCodes: ["LYFTARI"] },
  { employeeNo: 12, title: "Vélamaður – jarðvinna", qualificationCodes: ["VALS", "PLOTUTHJAPPA"] },
  { employeeNo: 14, title: "Tæknimaður – færanlegur búnaður", qualificationCodes: ["RAFSTOD", "VATNSDAELA"] },
  { employeeNo: 17, title: "Bílstjóri / vélamaður", qualificationCodes: ["THJONUSTUBILL", "VELAKERRA"] },
  { employeeNo: 20, title: "Vélamaður – vinnuvélar", qualificationCodes: ["HJOLASKOFLA", "SKRIDSTYRD"] },
  { employeeNo: 22, title: "Vélamaður – gröfur", qualificationCodes: ["GROFUSKOFLA", "SMAGROFA"] },
  { employeeNo: 25, title: "Tæknimaður – þrif og dæling", qualificationCodes: ["HATHRYSTITHVOTTAVEL", "VATNSDAELA"] },
  { employeeNo: 28, title: "Vélamaður – lyftitæki", qualificationCodes: ["TELESKOPLYFTARI", "LYFTARI"] },
  { employeeNo: 31, title: "Bílstjóri / þjónustumaður", qualificationCodes: ["THJONUSTUBILL", "PALLBILL", "VELAKERRA"] },
];

function employeeNumber(no: number) {
  return `${EMPLOYEE_PREFIX}${String(no).padStart(2, "0")}`;
}

function fullResourceCode(shortCode: string) {
  return `${RESOURCE_PREFIX}${shortCode}`;
}

async function removeExisting(companyId: number) {
  const resourceRows = await prisma.workResource.findMany({
    where: { companyId, code: { startsWith: RESOURCE_PREFIX } },
    select: { id: true },
  });
  const resourceIds = resourceRows.map((row) => row.id);

  const taggedPersonAssignments = await prisma.workPartAssignment.deleteMany({
    where: { companyId, resourceKind: "PERSON", resourceLabel: ASSIGNMENT_TAG },
  });

  const resourceAssignments = resourceIds.length
    ? await prisma.workPartAssignment.deleteMany({ where: { companyId, workResourceId: { in: resourceIds } } })
    : { count: 0 };

  const qualifications = await prisma.employeeQualification.deleteMany({
    where: { companyId, notes: TEST_MARKER },
  });

  const resourcesDeleted = await prisma.workResource.deleteMany({
    where: { companyId, code: { startsWith: RESOURCE_PREFIX } },
  });

  return {
    taggedPersonAssignments: taggedPersonAssignments.count,
    resourceAssignments: resourceAssignments.count,
    qualifications: qualifications.count,
    resources: resourcesDeleted.count,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reset = process.argv.includes("--reset");

  const company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });
  if (!company) throw new Error(`Fann ekki fyrirtækið „${COMPANY_NAME}“.`);

  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, employeeNumber: { startsWith: EMPLOYEE_PREFIX } },
    select: { id: true, employeeNumber: true, fullName: true, jobTitle: true },
    orderBy: { employeeNumber: "asc" },
  });
  const works = await prisma.workOrder.findMany({
    where: { companyId: company.id, externalId: { startsWith: WORK_EXTERNAL_PREFIX } },
    select: { id: true, externalId: true, title: true, workParts: { select: { id: true, sequence: true }, orderBy: { sequence: "asc" } } },
    orderBy: { externalId: "asc" },
  });

  if (employees.length < 50 || works.length < 300) {
    throw new Error(`Vantar grunnálagsgögn. Fann ${employees.length} prófunarstarfsmenn og ${works.length} prófunarverk. Keyrðu 50/300 seed fyrst.`);
  }

  const existingResources = await prisma.workResource.count({ where: { companyId: company.id, code: { startsWith: RESOURCE_PREFIX } } });
  const existingQualifications = await prisma.employeeQualification.count({ where: { companyId: company.id, notes: TEST_MARKER } });

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Grunngögn: ${employees.length} starfsmenn + ${works.length} Verk.`);
  console.log(`Á að bæta við: ${resources.length} vélum/tækjum og ${operators.length} vélatengdum starfsmönnum.`);
  console.log("36 af núverandi Verkþáttum fá samstæða vél + vélamann til prófunar.");
  console.log(`Nú þegar til: ${existingResources} prófunartæki, ${existingQualifications} prófunarréttindi.`);

  if (!apply) {
    console.log("\nDRY RUN — engum gögnum var breytt.");
    console.log("Keyrðu aftur með --apply til að stofna vélagögnin.");
    console.log("Notaðu --reset --apply ef þú vilt endurgera vélaprófið.");
    return;
  }

  if ((existingResources > 0 || existingQualifications > 0) && !reset) {
    throw new Error("Vélaprófunargögn eru þegar til. Notaðu --reset --apply til að endurgera þau.");
  }

  if (reset) {
    const removed = await removeExisting(company.id);
    console.log(`Hreinsaði eldri vélaprófunargögn: ${JSON.stringify(removed)}`);
  }

  const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNumber, employee]));

  for (const operator of operators) {
    const employee = employeeByNumber.get(employeeNumber(operator.employeeNo));
    if (!employee) throw new Error(`Fann ekki prófunarstarfsmann ${employeeNumber(operator.employeeNo)}.`);

    await prisma.employee.update({
      where: { id: employee.id },
      data: { jobTitle: operator.title, department: "Vélar" },
    });

    for (const qualificationCode of operator.qualificationCodes) {
      const matchingResource = resources.find((resource) => resource.qualification === qualificationCode);
      await prisma.employeeQualification.create({
        data: {
          companyId: company.id,
          employeeId: employee.id,
          qualificationType: matchingResource?.kind === "VEHICLE" ? "DRIVING_LICENSE" : matchingResource?.kind === "TOOL" ? "TRAINING" : "MACHINE",
          title: matchingResource ? `Heimild / hæfni – ${matchingResource.name}` : `Vélahæfni – ${qualificationCode}`,
          issuer: "GLÖGGT prófun",
          qualificationCodes: qualificationCode,
          validFrom: new Date("2025-01-01T00:00:00.000Z"),
          validUntil: new Date("2028-12-31T23:59:59.000Z"),
          notes: TEST_MARKER,
        },
      });
    }
  }

  for (const resource of resources) {
    const created = await prisma.workResource.create({
      data: {
        companyId: company.id,
        kind: resource.kind,
        code: fullResourceCode(resource.code),
        name: resource.name,
        description: `${TEST_MARKER} Prófunarauðlind fyrir Verk/Dagskipulag og vélamannapörun. Hæfnikóði: ${resource.qualification}.`,
        sourceLanguage: "is",
        status: resource.status,
        baseUnit: resource.baseUnit,
        costRateIsk: resource.costRateIsk,
        saleRateIsk: resource.saleRateIsk,
        meterUnit: resource.meterUnit,
        meterValue: resource.meterValue,
        qrToken: `gloggt-loadtest-${resource.code.toLowerCase()}-20260920`,
        isActive: true,
      },
    });

    if (resource.meterUnit && resource.meterValue !== null) {
      await prisma.workResourceMeterReading.create({
        data: {
          companyId: company.id,
          workResourceId: created.id,
          readingAt: new Date("2026-09-20T08:00:00.000Z"),
          value: resource.meterValue,
          unit: resource.meterUnit,
          note: TEST_MARKER,
          source: "IMPORTED",
        },
      });
    }
  }

  const createdResources = await prisma.workResource.findMany({
    where: { companyId: company.id, code: { startsWith: RESOURCE_PREFIX }, status: { notIn: ["MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"] } },
    select: { id: true, code: true, name: true, kind: true, description: true },
    orderBy: { code: "asc" },
  });

  const qualificationToEmployees = new Map<string, number[]>();
  for (const operator of operators) {
    const employee = employeeByNumber.get(employeeNumber(operator.employeeNo))!;
    for (const code of operator.qualificationCodes) {
      const list = qualificationToEmployees.get(code) ?? [];
      list.push(employee.id);
      qualificationToEmployees.set(code, list);
    }
  }

  const resourcePlan = createdResources.map((resource) => {
    const shortCode = resource.code.replace(RESOURCE_PREFIX, "");
    const definition = resources.find((item) => item.code === shortCode)!;
    return { ...resource, qualification: definition.qualification };
  });

  let assignmentCount = 0;
  const selectedWorks = works.filter((work) => work.workParts.length > 0).slice(0, 36);

  for (let index = 0; index < selectedWorks.length; index++) {
    const work = selectedWorks[index];
    const part = work.workParts[0];
    const resource = resourcePlan[index % resourcePlan.length];
    const candidateEmployees = qualificationToEmployees.get(resource.qualification) ?? [];
    if (candidateEmployees.length === 0) continue;
    const employeeId = candidateEmployees[index % candidateEmployees.length];

    await prisma.workPartAssignment.create({
      data: {
        companyId: company.id,
        workPartId: part.id,
        resourceKind: resource.kind,
        workResourceId: resource.id,
        resourceLabel: resource.name,
      },
    });

    await prisma.workPartAssignment.create({
      data: {
        companyId: company.id,
        workPartId: part.id,
        resourceKind: "PERSON",
        employeeId,
        resourceLabel: ASSIGNMENT_TAG,
      },
    });

    assignmentCount += 2;
  }

  const totals = await Promise.all([
    prisma.workResource.count({ where: { companyId: company.id, code: { startsWith: RESOURCE_PREFIX } } }),
    prisma.employeeQualification.count({ where: { companyId: company.id, notes: TEST_MARKER } }),
    prisma.workPartAssignment.count({ where: { companyId: company.id, resourceLabel: ASSIGNMENT_TAG } }),
    prisma.workPartAssignment.count({ where: { companyId: company.id, workResource: { code: { startsWith: RESOURCE_PREFIX } } } }),
  ]);

  console.log("\nTilbúið.");
  console.log(`Vélar/tæki: ${totals[0]}`);
  console.log(`Vélatengd réttindi/hæfni: ${totals[1]}`);
  console.log(`Prófunarúthlutanir starfsmanna: ${totals[2]}`);
  console.log(`Prófunarúthlutanir véla/tækja: ${totals[3]}`);
  console.log(`Samtals stofnaðar úthlutunarfærslur í þessari keyrslu: ${assignmentCount}.`);
  console.log("Ath.: einn búnaður er í MAINTENANCE og einn IN_USE til að prófa stöður; þeir eru ekki valdir í sjálfvirku pörunina ef staða útilokar það.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
