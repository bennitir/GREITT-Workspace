ALTER TABLE "ServiceTimeEntry"
ADD COLUMN "durationSeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "ServiceTimeEntry"
SET "durationSeconds" = GREATEST("durationMinutes", 0) * 60
WHERE "durationSeconds" = 0;
