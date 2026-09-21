import { prisma } from "../lib/prisma";

const COMPANY_NAME = "Próf ehf 2.";
const EMPLOYEE_PREFIXES = ["GLG-LT-EMP-20260921-", "GLG-LT-EMP-20260920-"];
const WORK_EXTERNAL_PREFIXES = ["GLG-LT-WORK-20260921-", "GLG-LT-WORK-20260920-"];

async function main() {
  const apply = process.argv.includes("--apply");

  const company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new Error(`Fann ekki fyrirtækið „${COMPANY_NAME}“. Engu var eytt.`);
  }

  const employees = await prisma.employee.findMany({
    where: {
      companyId: company.id,
      OR: EMPLOYEE_PREFIXES.map((prefix) => ({ employeeNumber: { startsWith: prefix } })),
    },
    select: { id: true },
  });
  const employeeIds = employees.map((employee) => employee.id);

  const workWhere = {
    companyId: company.id,
    OR: WORK_EXTERNAL_PREFIXES.map((prefix) => ({ externalId: { startsWith: prefix } })),
  };

  const workCount = await prisma.workOrder.count({ where: workWhere });

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Fann ${employees.length} prófunarstarfsmenn og ${workCount} prófunarverk úr 20./21. september settunum.`);

  if (!apply) {
    console.log("\nDRY RUN — engu var eytt. Keyrðu aftur með --apply til að hreinsa prófunargögnin.");
    return;
  }

  // WorkOrder eyðing cascadar í prófunar-Verkþætti og tengd prófunargögn.
  const deletedWorks = await prisma.workOrder.deleteMany({ where: workWhere });

  // Ef prófunarstarfsmenn hafa verið dregnir yfir á önnur Verk meðan á leik stendur,
  // hreinsum við þær prófunartengingar líka áður en starfsmönnunum er eytt.
  let deletedAssignments = 0;
  let deletedLaborFacts = 0;
  if (employeeIds.length > 0) {
    const assignments = await prisma.workPartAssignment.deleteMany({
      where: { companyId: company.id, employeeId: { in: employeeIds } },
    });
    deletedAssignments = assignments.count;

    const laborFacts = await prisma.workPartLaborFact.deleteMany({
      where: { companyId: company.id, employeeId: { in: employeeIds } },
    });
    deletedLaborFacts = laborFacts.count;
  }

  const deletedEmployees = await prisma.employee.deleteMany({
    where: { id: { in: employeeIds } },
  });

  console.log("\nHreinsun lokið.");
  console.log(`Verk: ${deletedWorks.count}`);
  console.log(`Úthlutanir prófunarstarfsmanna: ${deletedAssignments}`);
  console.log(`Raunvinnutímaskráningar prófunarstarfsmanna: ${deletedLaborFacts}`);
  console.log(`Starfsmenn: ${deletedEmployees.count}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
