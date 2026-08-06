-- CreateTable
CREATE TABLE "PayrollJurisdiction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sutaPct" REAL,
    "sutaWageBase" REAL,
    "sutaRateYear" INTEGER,
    "workersCompBasis" TEXT NOT NULL DEFAULT 'PER_100_PAYROLL',
    "stateFund" BOOLEAN NOT NULL DEFAULT false,
    "wageAuthority" TEXT,
    "notes" TEXT,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "verifiedNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollJurisdiction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollJurisdiction_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollCounty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jurisdictionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fips" TEXT,
    "notes" TEXT,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollCounty_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "PayrollJurisdiction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollCounty_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WageRateSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "countyId" TEXT,
    "rateScheduleDate" DATETIME,
    "determinationRef" TEXT,
    "sutaPctOverride" REAL,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "verifiedNote" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WageRateSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WageRateSheet_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "PayrollJurisdiction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WageRateSheet_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "PayrollCounty" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WageRateSheet_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WageRateLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "classification" TEXT,
    "hourlyWage" REAL NOT NULL DEFAULT 0,
    "hourlyBenefits" REAL NOT NULL DEFAULT 0,
    "trainingPerHour" REAL NOT NULL DEFAULT 0,
    "workersCompPerHour" REAL NOT NULL DEFAULT 0,
    "overtimeMultiplier" REAL NOT NULL DEFAULT 1.5,
    "publishedBaseWage" REAL,
    "publishedFringe" REAL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WageRateLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "WageRateSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "targetMarginPct" REAL NOT NULL DEFAULT 0.16,
    "defaultRetentionPct" REAL NOT NULL DEFAULT 0.05,
    "defaultLaborBurdenPct" REAL NOT NULL DEFAULT 0.34,
    "defaultOverheadPct" REAL NOT NULL DEFAULT 0.06,
    "futaPct" REAL NOT NULL DEFAULT 0.006,
    "ficaPct" REAL NOT NULL DEFAULT 0.0765,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Company" ("address", "city", "createdAt", "defaultLaborBurdenPct", "defaultOverheadPct", "defaultRetentionPct", "fiscalYearStartMonth", "id", "legalName", "name", "phone", "state", "targetMarginPct", "updatedAt") SELECT "address", "city", "createdAt", "defaultLaborBurdenPct", "defaultOverheadPct", "defaultRetentionPct", "fiscalYearStartMonth", "id", "legalName", "name", "phone", "state", "targetMarginPct", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PayrollJurisdiction_companyId_idx" ON "PayrollJurisdiction"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollJurisdiction_companyId_code_key" ON "PayrollJurisdiction"("companyId", "code");

-- CreateIndex
CREATE INDEX "PayrollCounty_jurisdictionId_idx" ON "PayrollCounty"("jurisdictionId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCounty_jurisdictionId_name_key" ON "PayrollCounty"("jurisdictionId", "name");

-- CreateIndex
CREATE INDEX "WageRateSheet_projectId_idx" ON "WageRateSheet"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "WageRateSheet_projectId_name_key" ON "WageRateSheet"("projectId", "name");

-- CreateIndex
CREATE INDEX "WageRateLine_sheetId_idx" ON "WageRateLine"("sheetId");

-- CreateIndex
CREATE UNIQUE INDEX "WageRateLine_sheetId_trade_key" ON "WageRateLine"("sheetId", "trade");
