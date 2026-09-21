import { prisma } from "../lib/prisma";

function argValue(name: string) {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const companyId = Number(argValue("company-id"));

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error("Notaðu --company-id=<id>. Dæmi: --company-id=1");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, address: true },
  });

  if (!company) {
    throw new Error(`Fyrirtæki #${companyId} fannst ekki.`);
  }

  const breakRows = [
    {
      sequence: 1,
      code: "MORNING",
      label: "Fyrra kaffihlé",
      targetStartMinutes: 9 * 60 + 40,
      durationMinutes: 20,
    },
    {
      sequence: 2,
      code: "LUNCH",
      label: "Hádegishlé",
      targetStartMinutes: 12 * 60,
      durationMinutes: 30,
    },
    {
      sequence: 3,
      code: "AFTERNOON",
      label: "Seinna kaffihlé",
      targetStartMinutes: 15 * 60 + 30,
      durationMinutes: 15,
    },
  ] as const;

  const activeEmployees = await prisma.employee.count({
    where: { companyId, isActive: true },
  });

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log("Vinnudagur: 08:00, 480 mínútur.");
  console.log("Hlé: 09:40/20 mín., 12:00/30 mín., 15:30/15 mín.");
  console.log(
    "Sveigjanleiki: allt að 30 mín. síðar; ef 15 mín. eða minna eru eftir af Verki má klára fyrst.",
  );
  console.log(`Virkir starfsmenn: ${activeEmployees}.`);
  console.log("Kjarasamnings-/launatúlkun er EKKI sett með þessu scripti.");

  if (!apply) {
    console.log("\nDRY RUN — engum gögnum var breytt.");
    console.log(
      `Keyrðu aftur með --apply til að stofna vinnustaðarprófíl fyrir fyrirtæki #${companyId}.`,
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.workplaceScheduleProfile.updateMany({
      where: { companyId },
      data: { isDefault: false },
    });

    const existing = await tx.workplaceScheduleProfile.findFirst({
      where: { companyId, name: "Prófunarvinnustaður" },
      select: { id: true },
    });

    const profile = existing
      ? await tx.workplaceScheduleProfile.update({
          where: { id: existing.id },
          data: {
            address: company.address || null,
            dayStartMinutes: 8 * 60,
            standardWorkMinutes: 8 * 60,
            isDefault: true,
            isActive: true,
          },
        })
      : await tx.workplaceScheduleProfile.create({
          data: {
            companyId,
            name: "Prófunarvinnustaður",
            address: company.address || null,
            dayStartMinutes: 8 * 60,
            standardWorkMinutes: 8 * 60,
            isDefault: true,
          },
        });

    for (const row of breakRows) {
      await tx.workplaceBreakRule.upsert({
        where: {
          workplaceScheduleProfileId_code: {
            workplaceScheduleProfileId: profile.id,
            code: row.code,
          },
        },
        create: {
          companyId,
          workplaceScheduleProfileId: profile.id,
          ...row,
          flexibleBeforeMinutes: 0,
          flexibleAfterMinutes: 30,
          allowFinishNearCompleteWork: true,
          finishNearCompleteThresholdMinutes: 15,
        },
        update: {
          sequence: row.sequence,
          label: row.label,
          targetStartMinutes: row.targetStartMinutes,
          durationMinutes: row.durationMinutes,
          flexibleBeforeMinutes: 0,
          flexibleAfterMinutes: 30,
          allowFinishNearCompleteWork: true,
          finishNearCompleteThresholdMinutes: 15,
        },
      });
    }

    await tx.employee.updateMany({
      where: {
        companyId,
        isActive: true,
        workplaceScheduleProfileId: null,
      },
      data: { workplaceScheduleProfileId: profile.id },
    });
  });

  console.log("\nTilbúið.");
  console.log(
    "Sjálfgefinn vinnustaðarprófíll og þrjú neysluhlé voru stofnuð/uppfærð.",
  );
  console.log(
    "Virkir starfsmenn sem höfðu engan vinnustaðarprófíl voru tengdir við hann.",
  );
  console.log(
    "Kjarasamningsprófílar eru áfram óskráðir þar til við staðfestum hvaða samningar/reglur eiga við.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
