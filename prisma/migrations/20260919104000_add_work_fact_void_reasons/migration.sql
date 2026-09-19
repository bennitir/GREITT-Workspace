-- Preserve a human-readable reason when a completed work fact is invalidated.
ALTER TABLE "WorkPartLaborFact" ADD COLUMN "voidReason" TEXT;
ALTER TABLE "WorkPartUsageFact" ADD COLUMN "voidReason" TEXT;
