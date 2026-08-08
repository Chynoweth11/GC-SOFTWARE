-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_EstimateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "sectionId" TEXT,
    "divisionId" TEXT,
    "description" TEXT NOT NULL,
    "drawingRef" TEXT,
    "measure" TEXT NOT NULL DEFAULT 'EA',
    "count" REAL NOT NULL DEFAULT 0,
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
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EstimateItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EstimateSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EstimateItem_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EstimateItem" ("count", "depth", "description", "divisionId", "drawingRef", "equipmentUnitCost", "estimateId", "id", "laborClass", "laborHrsPerUnit", "laborRateOverride", "length", "materialUnitCost", "measure", "netQtyOverride", "notes", "sectionId", "sortOrder", "subUnitCost", "uom", "wastePct", "width") SELECT "count", "depth", "description", "divisionId", "drawingRef", "equipmentUnitCost", "estimateId", "id", "laborClass", "laborHrsPerUnit", "laborRateOverride", "length", "materialUnitCost", "measure", "netQtyOverride", "notes", "sectionId", "sortOrder", "subUnitCost", "uom", "wastePct", "width" FROM "EstimateItem";
DROP TABLE "EstimateItem";
ALTER TABLE "new_EstimateItem" RENAME TO "EstimateItem";
CREATE INDEX "EstimateItem_estimateId_idx" ON "EstimateItem"("estimateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

