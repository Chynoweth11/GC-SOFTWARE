-- CreateTable
CREATE TABLE "LaborClassification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FIELD',
    "payBasis" TEXT NOT NULL DEFAULT 'HOURLY',
    "baseAmount" REAL NOT NULL DEFAULT 0,
    "benefitsAmount" REAL NOT NULL DEFAULT 0,
    "annualHours" REAL NOT NULL DEFAULT 2080,
    "trainingPerHour" REAL NOT NULL DEFAULT 0,
    "workersCompRate" REAL NOT NULL DEFAULT 0,
    "jurisdictionId" TEXT,
    "costCategory" TEXT NOT NULL DEFAULT 'LABOR',
    "tradeId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LaborClassification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LaborClassification_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "PayrollJurisdiction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LaborClassification_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectLaborAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "label" TEXT,
    "costCodeId" TEXT,
    "basis" TEXT NOT NULL DEFAULT 'ALLOCATION',
    "budgetedHours" REAL NOT NULL DEFAULT 0,
    "allocationPct" REAL NOT NULL DEFAULT 1,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "loadedRateOverride" REAL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectLaborAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectLaborAssignment_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "LaborClassification" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectLaborAssignment_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OverheadCost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" REAL NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "incurredOn" DATETIME,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OverheadCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CERTIFIED_PAYROLL',
    "title" TEXT NOT NULL,
    "agency" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'WEEKLY',
    "firstDueDate" DATETIME NOT NULL,
    "endsOn" DATETIME,
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "responsibleUserId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComplianceRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplianceRequirement_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComplianceSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requirementId" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "periodEnd" DATETIME,
    "submittedAt" DATETIME NOT NULL,
    "submittedById" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComplianceSubmission_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ComplianceRequirement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComplianceSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LaborRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "rate" REAL,
    "classificationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LaborRate_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LaborRate_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "LaborClassification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LaborRate" ("className", "estimateId", "id", "rate", "sortOrder") SELECT "className", "estimateId", "id", "rate", "sortOrder" FROM "LaborRate";
DROP TABLE "LaborRate";
ALTER TABLE "new_LaborRate" RENAME TO "LaborRate";
CREATE UNIQUE INDEX "LaborRate_estimateId_className_key" ON "LaborRate"("estimateId", "className");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LaborClassification_companyId_idx" ON "LaborClassification"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "LaborClassification_companyId_name_key" ON "LaborClassification"("companyId", "name");

-- CreateIndex
CREATE INDEX "ProjectLaborAssignment_projectId_idx" ON "ProjectLaborAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectLaborAssignment_classificationId_idx" ON "ProjectLaborAssignment"("classificationId");

-- CreateIndex
CREATE INDEX "OverheadCost_companyId_idx" ON "OverheadCost"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "OverheadCost_companyId_name_key" ON "OverheadCost"("companyId", "name");

-- CreateIndex
CREATE INDEX "ComplianceRequirement_projectId_idx" ON "ComplianceRequirement"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRequirement_projectId_title_key" ON "ComplianceRequirement"("projectId", "title");

-- CreateIndex
CREATE INDEX "ComplianceSubmission_requirementId_idx" ON "ComplianceSubmission"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSubmission_requirementId_dueDate_key" ON "ComplianceSubmission"("requirementId", "dueDate");
