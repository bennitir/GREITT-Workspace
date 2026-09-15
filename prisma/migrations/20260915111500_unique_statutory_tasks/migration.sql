-- Kerfisverkefni fyrir sama fyrirtæki og sama skilatímabil mega aðeins verða eitt.
CREATE UNIQUE INDEX "CompanyTask_companyId_sourceType_sourceId_key"
ON "CompanyTask"("companyId", "sourceType", "sourceId");
