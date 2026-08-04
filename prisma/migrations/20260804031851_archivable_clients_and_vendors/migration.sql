-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("address", "companyId", "contact", "createdAt", "email", "id", "name", "notes", "phone", "type") SELECT "address", "companyId", "contact", "createdAt", "email", "id", "name", "notes", "phone", "type" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");
CREATE TABLE "new_Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSubcontractor" BOOLEAN NOT NULL DEFAULT true,
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
    CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Vendor_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Vendor" ("address", "autoExpiration", "bondRequired", "bondStatus", "companyId", "contactName", "createdAt", "email", "glExpiration", "id", "isSubcontractor", "name", "notes", "paymentHold", "paymentHoldReason", "performanceRating", "phone", "qualityRating", "safetyRating", "scheduleRating", "taxId", "tradeId", "umbrellaExpiration", "w9OnFile", "wcExpiration") SELECT "address", "autoExpiration", "bondRequired", "bondStatus", "companyId", "contactName", "createdAt", "email", "glExpiration", "id", "isSubcontractor", "name", "notes", "paymentHold", "paymentHoldReason", "performanceRating", "phone", "qualityRating", "safetyRating", "scheduleRating", "taxId", "tradeId", "umbrellaExpiration", "w9OnFile", "wcExpiration" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");
CREATE UNIQUE INDEX "Vendor_companyId_name_key" ON "Vendor"("companyId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
