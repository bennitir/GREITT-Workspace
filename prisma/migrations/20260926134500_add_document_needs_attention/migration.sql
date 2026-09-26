-- Fylgiskjöl: leyfa að setja eitt greint undirskjal til hliðar fyrir nánari skoðun
-- án þess að færa allt frumskjalið / önnur undirskjöl úr venjulegri yfirferð.

ALTER TABLE "AiDetectedDocument"
ADD COLUMN "needsAttentionAt" TIMESTAMP(3);

CREATE INDEX "AiDetectedDocument_needsAttentionAt_idx"
ON "AiDetectedDocument"("needsAttentionAt");
