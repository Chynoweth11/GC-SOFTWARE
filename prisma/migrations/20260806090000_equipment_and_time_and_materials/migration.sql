-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "ownership" TEXT NOT NULL DEFAULT 'OWNED',
    "hourlyRate" REAL NOT NULL DEFAULT 0,
    "dailyRate" REAL NOT NULL DEFAULT 0,
    "weeklyRate" REAL NOT NULL DEFAULT 0,
    "monthlyRate" REAL NOT NULL DEFAULT 0,
    "operatingCostPerHour" REAL NOT NULL DEFAULT 0,
    "standbyRatePerHour" REAL NOT NULL DEFAULT 0,
    "hoursPerDay" REAL NOT NULL DEFAULT 8,
    "daysPerWeek" REAL NOT NULL DEFAULT 5,
    "vendorId" TEXT,
    "assetTag" TEXT,
    "costCategory" TEXT NOT NULL DEFAULT 'EQUIPMENT',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EquipmentItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectEquipmentAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "label" TEXT,
    "costCodeId" TEXT,
    "basis" TEXT NOT NULL DEFAULT 'DAILY',
    "units" REAL NOT NULL DEFAULT 0,
    "operatingHours" REAL NOT NULL DEFAULT 0,
    "standbyHours" REAL NOT NULL DEFAULT 0,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "rateOverride" REAL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectEquipmentAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectEquipmentAssignment_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectEquipmentAssignment_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChangeOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "documentKind" TEXT NOT NULL DEFAULT 'CHANGE_ORDER',
    "type" TEXT NOT NULL DEFAULT 'OWNER_REQUEST',
    "description" TEXT NOT NULL,
    "origin" TEXT,
    "tradeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "counterparty" TEXT,
    "reference" TEXT,
    "dateInitiated" DATETIME,
    "dateSubmitted" DATETIME,
    "dateApproved" DATETIME,
    "anticipatedApproval" DATETIME,
    "sentForSignatureAt" DATETIME,
    "fullySignedAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "approvalCertification" TEXT,
    "unapprovedReason" TEXT,
    "priceFromLines" BOOLEAN NOT NULL DEFAULT true,
    "enteredOwnerAmount" REAL NOT NULL DEFAULT 0,
    "enteredCostAmount" REAL NOT NULL DEFAULT 0,
    "laborBurdenPct" REAL NOT NULL DEFAULT 0,
    "salesTaxPct" REAL NOT NULL DEFAULT 0,
    "smallToolsPct" REAL NOT NULL DEFAULT 0,
    "contingencyPct" REAL NOT NULL DEFAULT 0,
    "overheadPct" REAL NOT NULL DEFAULT 0,
    "profitPct" REAL NOT NULL DEFAULT 0,
    "glInsurancePct" REAL NOT NULL DEFAULT 0,
    "bondPct" REAL NOT NULL DEFAULT 0,
    "exciseTaxPct" REAL NOT NULL DEFAULT 0,
    "roundToNearest" REAL NOT NULL DEFAULT 0,
    "probabilityPct" REAL NOT NULL DEFAULT 0,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "postsToBudget" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "rollsUpToId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ChangeOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_rollsUpToId_fkey" FOREIGN KEY ("rollsUpToId") REFERENCES "ChangeOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChangeOrder" ("anticipatedApproval", "approvalCertification", "approvedAt", "approvedById", "bondPct", "contingencyPct", "counterparty", "createdAt", "dateApproved", "dateInitiated", "dateSubmitted", "description", "documentKind", "enteredCostAmount", "enteredOwnerAmount", "exciseTaxPct", "fullySignedAt", "glInsurancePct", "id", "laborBurdenPct", "notes", "number", "origin", "overheadPct", "postsToBudget", "priceFromLines", "probabilityPct", "profitPct", "projectId", "reference", "roundToNearest", "salesTaxPct", "scheduleImpactDays", "sentForSignatureAt", "smallToolsPct", "status", "supersededById", "tradeId", "type", "unapprovedReason", "updatedAt") SELECT "anticipatedApproval", "approvalCertification", "approvedAt", "approvedById", "bondPct", "contingencyPct", "counterparty", "createdAt", "dateApproved", "dateInitiated", "dateSubmitted", "description", "documentKind", "enteredCostAmount", "enteredOwnerAmount", "exciseTaxPct", "fullySignedAt", "glInsurancePct", "id", "laborBurdenPct", "notes", "number", "origin", "overheadPct", "postsToBudget", "priceFromLines", "probabilityPct", "profitPct", "projectId", "reference", "roundToNearest", "salesTaxPct", "scheduleImpactDays", "sentForSignatureAt", "smallToolsPct", "status", "supersededById", "tradeId", "type", "unapprovedReason", "updatedAt" FROM "ChangeOrder";
DROP TABLE "ChangeOrder";
ALTER TABLE "new_ChangeOrder" RENAME TO "ChangeOrder";
CREATE INDEX "ChangeOrder_projectId_status_idx" ON "ChangeOrder"("projectId", "status");
CREATE INDEX "ChangeOrder_projectId_documentKind_idx" ON "ChangeOrder"("projectId", "documentKind");
CREATE UNIQUE INDEX "ChangeOrder_projectId_number_key" ON "ChangeOrder"("projectId", "number");
CREATE TABLE "new_ChangeOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeOrderId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "divisionCode" TEXT,
    "measure" TEXT NOT NULL DEFAULT 'LS',
    "count" REAL NOT NULL DEFAULT 1,
    "length" REAL NOT NULL DEFAULT 0,
    "width" REAL NOT NULL DEFAULT 0,
    "depth" REAL NOT NULL DEFAULT 0,
    "netQtyOverride" REAL,
    "uom" TEXT,
    "wastePct" REAL NOT NULL DEFAULT 0,
    "laborClass" TEXT,
    "laborHrsPerUnit" REAL NOT NULL DEFAULT 0,
    "laborRateOverride" REAL,
    "equipmentClass" TEXT,
    "equipmentHrsPerUnit" REAL NOT NULL DEFAULT 0,
    "equipmentRateOverride" REAL,
    "materialUnitCost" REAL NOT NULL DEFAULT 0,
    "equipmentUnitCost" REAL NOT NULL DEFAULT 0,
    "subUnitCost" REAL NOT NULL DEFAULT 0,
    "otherUnitCost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrderLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ChangeOrderLine" ("category", "changeOrderId", "costCodeId", "count", "createdAt", "depth", "description", "divisionCode", "equipmentUnitCost", "id", "laborClass", "laborHrsPerUnit", "laborRateOverride", "length", "materialUnitCost", "measure", "netQtyOverride", "notes", "otherUnitCost", "scope", "sortOrder", "subUnitCost", "uom", "updatedAt", "wastePct", "width") SELECT "category", "changeOrderId", "costCodeId", "count", "createdAt", "depth", "description", "divisionCode", "equipmentUnitCost", "id", "laborClass", "laborHrsPerUnit", "laborRateOverride", "length", "materialUnitCost", "measure", "netQtyOverride", "notes", "otherUnitCost", "scope", "sortOrder", "subUnitCost", "uom", "updatedAt", "wastePct", "width" FROM "ChangeOrderLine";
DROP TABLE "ChangeOrderLine";
ALTER TABLE "new_ChangeOrderLine" RENAME TO "ChangeOrderLine";
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EquipmentItem_companyId_idx" ON "EquipmentItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentItem_companyId_name_key" ON "EquipmentItem"("companyId", "name");

-- CreateIndex
CREATE INDEX "ProjectEquipmentAssignment_projectId_idx" ON "ProjectEquipmentAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectEquipmentAssignment_equipmentItemId_idx" ON "ProjectEquipmentAssignment"("equipmentItemId");

