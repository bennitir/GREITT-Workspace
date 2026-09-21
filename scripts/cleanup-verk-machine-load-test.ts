import { prisma } from "../lib/prisma";

const COMPANY_NAME = "Próf ehf 2.";
const EMPLOYEE_PREFIX = "GLG-LT-EMP-20260920-";
const RESOURCE_PREFIX = "GLG-LT-RES-20260920-";
const ASSIGNMENT_TAG = "GLG-LT-MACHINE-ASSIGN-20260920";
const TEST_MARKER = "[GLÖGGT MACHINE LOAD TEST 2026-09-20]";

const baseDepartments = ["Viðhald", "Þrif", "Lager", "Þjónusta", "Vélar", "Umhverfi", "Flutningar", "Eftirlit"];
const baseJobTitles = ["Starfsmaður", "Tæknimaður", "Vélamaður", "Þjónustufulltrúi", "Umsjónarmaður", "Lagerstarfsmaður", "Iðnaðarmaður"];

function employeeIndex(employeeNumber: string | null) {
  if (!employeeNumber?.startsWith(EMPLOYEE_PREFIX)) return null;
  const value = Number(employeeNumber.slice(EMPLOYEE_PREFIX.length));
  return Number.isInteger(value) && value >= 1 ? value - 1 : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const company = await prisma.company.findFirst({ where: { name: COMPANY_NAME }, select: { id: true, name: true } });
  if (!company) throw new Error(`Fann ekki fyrirtækið „${COMPANY_NAME}“.`);

  const resourceRows = await prisma.workResource.findMany({
    where: { companyId: company.id, code: { startsWith: RESOURCE_PREFIX } },
    select: { id: true, code: true },
  });
  const resourceIds = resourceRows.map((row) => row.id);
  const qualificationCount = await prisma.employeeQualification.count({ where: { companyId: company.id, notes: TEST_MARKER } });
  const personAssignmentCount = await prisma.workPartAssignment.count({ where: { companyId: company.id, resourceLabel: ASSIGNMENT_TAG } });
  const resourceAssignmentCount = resourceIds.length
    ? await prisma.workPartAssignment.count({ where: { companyId: company.id, workResourceId: { in: resourceIds } } })
    : 0;

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Finn ${resourceRows.length} prófunartæki, ${qualificationCount} réttindi, ${personAssignmentCount} starfsmannaúthlutanir og ${resourceAssignmentCount} tækjaúthlutanir.`);

  if (!apply) {
    console.log("\nDRY RUN — engu var eytt.");
    console.log("Keyrðu aftur með --apply til að hreinsa aðeins vélaviðbótina.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workPartAssignment.deleteMany({ where: { companyId: company.id, resourceLabel: ASSIGNMENT_TAG } });
    if (resourceIds.length) {
      await tx.workPartAssignment.deleteMany({ where: { companyId: company.id, workResourceId: { in: resourceIds } } });
    }
    await tx.employeeQualification.deleteMany({ where: { companyId: company.id, notes: TEST_MARKER } });
    await tx.workResource.deleteMany({ where: { companyId: company.id, code: { startsWith: RESOURCE_PREFIX } } });

    const employees = await tx.employee.findMany({
      where: { companyId: company.id, employeeNumber: { startsWith: EMPLOYEE_PREFIX } },
      select: { id: true, employeeNumber: true },
    });
    for (const employee of employees) {
      const index = employeeIndex(employee.employeeNumber);
      if (index === null) continue;
      await tx.employee.update({
        where: { id: employee.id },
        data: {
          jobTitle: baseJobTitles[index % baseJobTitles.length],
          department: baseDepartments[index % baseDepartments.length],
        },
      });
    }
  });

  console.log("\nVélaprófunargögn hreinsuð. 50/300 grunngögnin voru skilin eftir.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
