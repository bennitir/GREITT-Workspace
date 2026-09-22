CREATE TABLE "IcelandAddress" (
    "id" SERIAL NOT NULL,
    "hnitnum" TEXT NOT NULL,
    "heinum" TEXT,
    "landnr" TEXT,
    "municipalityCode" TEXT,
    "postalCode" TEXT,
    "streetName" TEXT NOT NULL,
    "houseNumber" TEXT,
    "houseNumberSort" INTEGER,
    "houseLetter" TEXT,
    "suffix" TEXT,
    "specialName" TEXT,
    "addressText" TEXT NOT NULL,
    "displayText" TEXT NOT NULL,
    "streetSearch" TEXT NOT NULL,
    "specialSearch" TEXT,
    "displaySearch" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "sourceUpdatedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IcelandAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IcelandAddress_hnitnum_key" ON "IcelandAddress"("hnitnum");
CREATE INDEX "IcelandAddress_streetSearch_idx" ON "IcelandAddress"("streetSearch");
CREATE INDEX "IcelandAddress_specialSearch_idx" ON "IcelandAddress"("specialSearch");
CREATE INDEX "IcelandAddress_displaySearch_idx" ON "IcelandAddress"("displaySearch");
CREATE INDEX "IcelandAddress_postalCode_idx" ON "IcelandAddress"("postalCode");
