-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kennitala" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_kennitala_key" ON "Company"("kennitala");
