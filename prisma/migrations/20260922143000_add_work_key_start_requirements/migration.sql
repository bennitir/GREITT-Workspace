-- Almennar, verklyklastýrðar reglur sem gilda þegar Mobile-vinna hefst.
-- Reglur eru raðir fremur en fastir dálkar svo hægt sé að bæta við nýjum
-- upphafsspurningum síðar án þess að breyta WorkKey-líkaninu í hvert sinn.
CREATE TABLE "WorkKeyStartRule" (
    "id" SERIAL NOT NULL,
    "workKeyId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkKeyStartRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkKeyStartRule_workKeyId_kind_key"
    ON "WorkKeyStartRule"("workKeyId", "kind");
CREATE INDEX "WorkKeyStartRule_kind_isActive_idx"
    ON "WorkKeyStartRule"("kind", "isActive");
CREATE INDEX "WorkKeyStartRule_workKeyId_sortOrder_idx"
    ON "WorkKeyStartRule"("workKeyId", "sortOrder");

ALTER TABLE "WorkKeyStartRule"
    ADD CONSTRAINT "WorkKeyStartRule_workKeyId_fkey"
    FOREIGN KEY ("workKeyId") REFERENCES "WorkKey"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Snapshot á raunverulegri upphafsstöðu/svörum. Þannig breytir seinni
-- breyting á verklykli ekki sögulegri vinnulotu.
ALTER TABLE "WorkPartLaborFact"
    ADD COLUMN "startContext" JSONB;

ALTER TABLE "EmployeeWorkDiaryEntry"
    ADD COLUMN "startContext" JSONB;
