-- CreateTable
CREATE TABLE "DocumentSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeOrderId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AWAITING',
    "signedAt" DATETIME,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentSignature_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'SIGNED_DOCUMENT',
    "fileName" TEXT NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentAttachment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ChangeOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Carry every existing document across without moving a single figure.
--
--   The old owner and cost amounts were lump sums, so priceFromLines is false
--   and they keep being read exactly as they were. Pricing a document from its
--   lines is something a person opts into afterwards.
--
--   approvedAt is backfilled for anything already approved or executed. That is
--   the whole point of this migration: from here on nothing reaches the
--   contract value without it, so a document counted yesterday must still be
--   counted today. The certification text says plainly that the approval was
--   carried forward rather than pretending somebody signed for it.
--
--   The old statuses map onto the new ones, which describe where a document is
--   on the way to signature rather than mixing that up with approval.
INSERT INTO "new_ChangeOrder" (
    "id", "projectId", "number", "documentKind", "type", "description", "origin", "tradeId",
    "status", "dateInitiated", "dateSubmitted", "dateApproved", "anticipatedApproval",
    "fullySignedAt", "approvedAt", "approvedById", "approvalCertification",
    "priceFromLines", "enteredOwnerAmount", "enteredCostAmount",
    "probabilityPct", "scheduleImpactDays", "postsToBudget", "notes", "createdAt", "updatedAt"
)
SELECT
    "id", "projectId", "number", 'CHANGE_ORDER', "type", "description", "origin", "tradeId",
    CASE "status"
        WHEN 'DRAFT' THEN 'DRAFT'
        WHEN 'PRICING' THEN 'INTERNAL_REVIEW'
        WHEN 'PENDING' THEN 'READY_TO_SEND'
        WHEN 'SUBMITTED' THEN 'SENT_FOR_SIGNATURE'
        WHEN 'UNDER_REVIEW' THEN 'SENT_FOR_SIGNATURE'
        WHEN 'APPROVED' THEN 'APPROVED'
        WHEN 'EXECUTED' THEN 'APPROVED'
        WHEN 'REJECTED' THEN 'REJECTED'
        WHEN 'VOID' THEN 'VOIDED'
        ELSE 'DRAFT'
    END,
    "dateInitiated", "dateSubmitted", "dateApproved", "anticipatedApproval",
    CASE WHEN "status" IN ('APPROVED', 'EXECUTED') THEN COALESCE("dateApproved", "updatedAt") END,
    CASE WHEN "status" IN ('APPROVED', 'EXECUTED') THEN COALESCE("dateApproved", "updatedAt") END,
    NULL,
    CASE WHEN "status" IN ('APPROVED', 'EXECUTED')
        THEN 'Approval carried forward when contract documents were separated from their approval. Re-certify to attribute it to a person.'
    END,
    0, "ownerAmount", "costAmount",
    "probabilityPct", "scheduleImpactDays", "postsToBudget", "notes", "createdAt", "updatedAt"
FROM "ChangeOrder";
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
-- Each existing line was a quantity at a unit cost. It becomes a takeoff line
-- that prices to the same number: the unit cost lands in the bucket its cost
-- type belongs to, and a labor line becomes one hour per unit at that rate,
-- which is the same money expressed in the fields that now exist.
INSERT INTO "new_ChangeOrderLine" (
    "id", "changeOrderId", "costCodeId", "category", "description",
    "measure", "count", "laborHrsPerUnit", "laborRateOverride",
    "materialUnitCost", "equipmentUnitCost", "subUnitCost", "otherUnitCost",
    "createdAt", "updatedAt"
)
SELECT
    "id", "changeOrderId", "costCodeId", "category", "description",
    'EA', "quantity",
    CASE WHEN "category" = 'LABOR' THEN 1 ELSE 0 END,
    CASE WHEN "category" = 'LABOR' THEN "unitCost" END,
    CASE WHEN "category" = 'MATERIAL' THEN "unitCost" ELSE 0 END,
    CASE WHEN "category" = 'EQUIPMENT' THEN "unitCost" ELSE 0 END,
    CASE WHEN "category" = 'SUBCONTRACT' THEN "unitCost" ELSE 0 END,
    CASE WHEN "category" NOT IN ('LABOR', 'MATERIAL', 'EQUIPMENT', 'SUBCONTRACT') THEN "unitCost" ELSE 0 END,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ChangeOrderLine";
DROP TABLE "ChangeOrderLine";
ALTER TABLE "new_ChangeOrderLine" RENAME TO "ChangeOrderLine";
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DocumentSignature_changeOrderId_idx" ON "DocumentSignature"("changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSignature_changeOrderId_party_key" ON "DocumentSignature"("changeOrderId", "party");

-- CreateIndex
CREATE INDEX "DocumentAttachment_changeOrderId_idx" ON "DocumentAttachment"("changeOrderId");

