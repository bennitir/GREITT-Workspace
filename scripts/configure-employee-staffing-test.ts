import { prisma } from "../lib/prisma";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const companyArg = args.find((arg) => arg.startsWith("--company-id="));
const companyId = Number(companyArg?.split("=")[1] ?? "1");

function codeFromTitle(title: string) {
  const replacements: Record<string, string> = {
    "ð": "d", "Ð": "D", "þ": "th", "Þ": "TH", "æ": "ae", "Æ": "AE", "ö": "o", "Ö": "O",
  };
  return title
    .split("")
    .map((char) => replacements[char] ?? char)
    .join("")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function main() {
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("Ógilt --company-id.");
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } });
  if (!company) throw new Error(`Fyrirtæki #${companyId} fannst ekki.`);

  const employees = await prisma.employee.findMany({
    where: { companyId, isActive: true },
    select: { id: true, fullName: true, jobTitle: true },
    orderBy: { fullName: "asc" },
  });
  const grouped = new Map<string, typeof employees>();
  for (const employee of employees) {
    const title = employee.jobTitle?.trim();
    if (!title) continue;
    const rows = grouped.get(title) ?? [];
    rows.push(employee);
    grouped.set(title, rows);
  }

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Virkir starfsmenn: ${employees.length}`);
  console.log("Mönnunarhlutverk úr núverandi starfsheitum:");
  for (const [title, rows] of grouped) console.log(`- ${title}: ${rows.length} (${codeFromTitle(title)})`);

  if (!apply) {
    console.log("\nDRY RUN — engum gögnum var breytt.");
    console.log("Keyrðu aftur með --apply til að stofna hlutverk og tengja starfsmenn sem aðalhlutverk.");
    return;
  }

  let assignments = 0;
  for (const [title, rows] of grouped) {
    const code = codeFromTitle(title);
    if (!code) continue;
    const role = await prisma.staffingRole.upsert({
      where: { companyId_code: { companyId, code } },
      create: { companyId, code, name: title, description: `Prófunarhlutverk stofnað úr starfsheiti: ${title}` },
      update: { name: title, isActive: true },
    });
    for (const employee of rows) {
      await prisma.employeeStaffingRole.updateMany({
        where: { companyId, employeeId: employee.id },
        data: { isPrimary: false },
      });
      await prisma.employeeStaffingRole.upsert({
        where: { employeeId_staffingRoleId: { employeeId: employee.id, staffingRoleId: role.id } },
        create: { companyId, employeeId: employee.id, staffingRoleId: role.id, isPrimary: true, isActive: true },
        update: { isPrimary: true, isActive: true },
      });
      assignments += 1;
    }
  }

  console.log("\nTilbúið.");
  console.log(`Mönnunarhlutverk: ${grouped.size}`);
  console.log(`Starfsmannatengingar: ${assignments}`);
  console.log("Ath.: Þetta er prófunarhjálp. Raunverulegt starfssvið, réttindi og mönnunarhlutverk þarf að staðfesta á starfsmannaspjaldinu.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
