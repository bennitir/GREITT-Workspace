-- CreateTable
CREATE TABLE "InsightEntityRelation" (
    "id" SERIAL NOT NULL,
    "fromEntityId" INTEGER NOT NULL,
    "toEntityId" INTEGER NOT NULL,
    "relationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "confidence" DOUBLE PRECISION,
    "note" TEXT,
    "metadata" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightEntityRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightEntityRelation_fromEntityId_status_idx"
ON "InsightEntityRelation"("fromEntityId", "status");

-- CreateIndex
CREATE INDEX "InsightEntityRelation_toEntityId_status_idx"
ON "InsightEntityRelation"("toEntityId", "status");

-- CreateIndex
CREATE INDEX "InsightEntityRelation_relationType_status_idx"
ON "InsightEntityRelation"("relationType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InsightEntityRelation_fromEntityId_toEntityId_relationType_key"
ON "InsightEntityRelation"("fromEntityId", "toEntityId", "relationType");

-- AddForeignKey
ALTER TABLE "InsightEntityRelation"
ADD CONSTRAINT "InsightEntityRelation_fromEntityId_fkey"
FOREIGN KEY ("fromEntityId") REFERENCES "InsightEntity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightEntityRelation"
ADD CONSTRAINT "InsightEntityRelation_toEntityId_fkey"
FOREIGN KEY ("toEntityId") REFERENCES "InsightEntity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
