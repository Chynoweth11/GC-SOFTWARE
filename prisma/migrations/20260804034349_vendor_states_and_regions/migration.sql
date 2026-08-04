-- CreateTable
CREATE TABLE "VendorState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VendorState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VendorRegion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VendorRegion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VendorRegion_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "VendorState" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSubcontractor" BOOLEAN NOT NULL DEFAULT true,
    "stateId" TEXT,
    "regionId" TEXT,
    "tradeId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "w9OnFile" BOOLEAN NOT NULL DEFAULT false,
    "glExpiration" DATETIME,
    "wcExpiration" DATETIME,
    "autoExpiration" DATETIME,
    "umbrellaExpiration" DATETIME,
    "bondRequired" BOOLEAN NOT NULL DEFAULT false,
    "bondStatus" TEXT,
    "paymentHold" BOOLEAN NOT NULL DEFAULT false,
    "paymentHoldReason" TEXT,
    "performanceRating" REAL,
    "safetyRating" REAL,
    "qualityRating" REAL,
    "scheduleRating" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vendor_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "VendorState" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Vendor_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "VendorRegion" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vendor_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Vendor" ("active", "address", "autoExpiration", "bondRequired", "bondStatus", "companyId", "contactName", "createdAt", "email", "glExpiration", "id", "isSubcontractor", "name", "notes", "paymentHold", "paymentHoldReason", "performanceRating", "phone", "qualityRating", "safetyRating", "scheduleRating", "taxId", "tradeId", "umbrellaExpiration", "w9OnFile", "wcExpiration") SELECT "active", "address", "autoExpiration", "bondRequired", "bondStatus", "companyId", "contactName", "createdAt", "email", "glExpiration", "id", "isSubcontractor", "name", "notes", "paymentHold", "paymentHoldReason", "performanceRating", "phone", "qualityRating", "safetyRating", "scheduleRating", "taxId", "tradeId", "umbrellaExpiration", "w9OnFile", "wcExpiration" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");
CREATE UNIQUE INDEX "Vendor_companyId_name_key" ON "Vendor"("companyId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VendorState_companyId_idx" ON "VendorState"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorState_companyId_name_key" ON "VendorState"("companyId", "name");

-- CreateIndex
CREATE INDEX "VendorRegion_companyId_idx" ON "VendorRegion"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRegion_stateId_name_key" ON "VendorRegion"("stateId", "name");
