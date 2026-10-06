ALTER TABLE "AiDetectedDocument"
ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "reviewedContentRevision" INTEGER;

-- Existing reviewed documents were authoritative before revision tracking
-- existed. Bind those reviews to the initial revision instead of invalidating
-- historical work during deployment.
UPDATE "AiDetectedDocument"
SET "reviewedContentRevision" = "contentRevision"
WHERE "reviewedAt" IS NOT NULL;
