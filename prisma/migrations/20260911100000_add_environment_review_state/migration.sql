ALTER TABLE "AiDetectedDocument"
ADD COLUMN "environmentReviewRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "environmentReviewReason" TEXT;
