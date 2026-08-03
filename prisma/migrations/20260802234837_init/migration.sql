-- CreateTable
CREATE TABLE "Company" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'READ_ONLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CsiDivision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CsiDivision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "divisionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Trade_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Trade_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "divisionId" TEXT,
    "tradeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "CostCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostCode_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostCode_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OTHER',
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "clientContact" TEXT,
    "clientPhone" TEXT,
    "clientType" TEXT NOT NULL DEFAULT 'OTHER',
    "leadSource" TEXT,
    "location" TEXT,
    "estimator" TEXT,
    "dateReceived" DATETIME,
    "bidDue" DATETIME,
    "estimatedValue" REAL NOT NULL DEFAULT 0,
    "submittedAmount" REAL NOT NULL DEFAULT 0,
    "dateSubmitted" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'LEAD',
    "winProbability" REAL NOT NULL DEFAULT 0,
    "lastContact" DATETIME,
    "nextFollowUp" DATETIME,
    "touches" INTEGER NOT NULL DEFAULT 0,
    "nextAction" TEXT,
    "decisionDate" DATETIME,
    "outcomeReason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Bid_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bid_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "bidId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT,
    "architect" TEXT,
    "address" TEXT,
    "projectType" TEXT,
    "bidDueDate" DATETIME,
    "estimator" TEXT,
    "drawingSet" TEXT,
    "addenda" TEXT,
    "durationWeeks" REAL NOT NULL DEFAULT 0,
    "buildingAreaSf" REAL NOT NULL DEFAULT 0,
    "laborBurdenPct" REAL NOT NULL DEFAULT 0.34,
    "salesTaxPct" REAL NOT NULL DEFAULT 0.086,
    "smallToolsPct" REAL NOT NULL DEFAULT 0.03,
    "contingencyPct" REAL NOT NULL DEFAULT 0.03,
    "overheadPct" REAL NOT NULL DEFAULT 0.06,
    "profitPct" REAL NOT NULL DEFAULT 0.10,
    "glInsurancePct" REAL NOT NULL DEFAULT 0.012,
    "bondPct" REAL NOT NULL DEFAULT 0.01,
    "exciseTaxPct" REAL NOT NULL DEFAULT 0.005,
    "roundToNearest" REAL NOT NULL DEFAULT 500,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Estimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Estimate_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LaborRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LaborRate_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateSection_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateItem" (
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
    "materialUnitCost" REAL NOT NULL DEFAULT 0,
    "equipmentUnitCost" REAL NOT NULL DEFAULT 0,
    "subUnitCost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EstimateItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EstimateSection" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EstimateItem_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GeneralConditionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'LS',
    "qty" REAL NOT NULL DEFAULT 0,
    "followsDuration" BOOLEAN NOT NULL DEFAULT false,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GeneralConditionItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateAlternate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateAlternate_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateClarification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateClarification_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "estimateId" TEXT,
    "projectId" TEXT,
    "tradeId" TEXT,
    "name" TEXT NOT NULL,
    "divisionCode" TEXT,
    "budgetAmount" REAL NOT NULL DEFAULT 0,
    "carriedAmount" REAL NOT NULL DEFAULT 0,
    "awardedVendorId" TEXT,
    "awardAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'BIDDING',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BidPackage_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BidPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BidPackage_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BidPackage_awardedVendorId_fkey" FOREIGN KEY ("awardedVendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BidPackageQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packageId" TEXT NOT NULL,
    "vendorId" TEXT,
    "vendorName" TEXT NOT NULL,
    "baseAmount" REAL NOT NULL DEFAULT 0,
    "adjustmentAmount" REAL NOT NULL DEFAULT 0,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "qualifications" TEXT,
    "allowances" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BidPackageQuote_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "BidPackage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BidPackageQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "projectType" TEXT,
    "deliveryMethod" TEXT,
    "architect" TEXT,
    "pmUserId" TEXT,
    "superintendent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "noticeToProceed" DATETIME,
    "contractStart" DATETIME,
    "contractCompletion" DATETIME,
    "forecastCompletion" DATETIME,
    "dataDate" DATETIME,
    "originalContractSum" REAL NOT NULL DEFAULT 0,
    "ownerRetentionPct" REAL NOT NULL DEFAULT 0.05,
    "defaultSubRetentionPct" REAL NOT NULL DEFAULT 0.05,
    "targetMarginPct" REAL NOT NULL DEFAULT 0.18,
    "laborBurdenPct" REAL NOT NULL DEFAULT 0.34,
    "overheadPct" REAL NOT NULL DEFAULT 0.06,
    "workDaysPerWeek" INTEGER NOT NULL DEFAULT 5,
    "eacMethod" TEXT NOT NULL DEFAULT 'BOTTOM_UP',
    "pocMethod" TEXT NOT NULL DEFAULT 'COST_TO_COST',
    "manualPctComplete" REAL,
    "pendingCoInclusionPct" REAL NOT NULL DEFAULT 0,
    "safetyScore" REAL,
    "qualityScore" REAL,
    "clientSatScore" REAL,
    "recordablesYtd" INTEGER NOT NULL DEFAULT 0,
    "nearMissesYtd" INTEGER NOT NULL DEFAULT 0,
    "observationsYtd" INTEGER NOT NULL DEFAULT 0,
    "sourceEstimateId" TEXT,
    "sourceBidId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_pmUserId_fkey" FOREIGN KEY ("pmUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_sourceEstimateId_fkey" FOREIGN KEY ("sourceEstimateId") REFERENCES "Estimate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_sourceBidId_fkey" FOREIGN KEY ("sourceBidId") REFERENCES "Bid" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tradeId" TEXT,
    "originalBudget" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "transferGroup" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BudgetRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetRevision_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetRevision_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SUBCONTRACT',
    "number" TEXT NOT NULL,
    "description" TEXT,
    "scopeOfWork" TEXT,
    "originalAmount" REAL NOT NULL DEFAULT 0,
    "retentionPct" REAL NOT NULL DEFAULT 0.05,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "dateIssued" DATETIME,
    "dateExecuted" DATETIME,
    "expectedDelivery" DATETIME,
    "actualDelivery" DATETIME,
    "receivedAmount" REAL NOT NULL DEFAULT 0,
    "forecastFinalOverride" REAL,
    "pctComplete" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Commitment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitmentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "description" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "CommitmentLine_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitmentLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommitmentChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dateSubmitted" DATETIME,
    "dateApproved" DATETIME,
    "changeOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommitmentChange_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommitmentChange_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ACTUAL',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "vendorId" TEXT,
    "commitmentId" TEXT,
    "subInvoiceId" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" REAL NOT NULL,
    "hours" REAL,
    "needsCoding" BOOLEAN NOT NULL DEFAULT false,
    "importHash" TEXT,
    "attachmentName" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostTransaction_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CostTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostTransaction_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostTransaction_subInvoiceId_fkey" FOREIGN KEY ("subInvoiceId") REFERENCES "SubInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'OWNER_REQUEST',
    "description" TEXT NOT NULL,
    "origin" TEXT,
    "tradeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dateInitiated" DATETIME,
    "dateSubmitted" DATETIME,
    "dateApproved" DATETIME,
    "anticipatedApproval" DATETIME,
    "ownerAmount" REAL NOT NULL DEFAULT 0,
    "costAmount" REAL NOT NULL DEFAULT 0,
    "submittedAmount" REAL NOT NULL DEFAULT 0,
    "approvedAmount" REAL NOT NULL DEFAULT 0,
    "rejectedAmount" REAL NOT NULL DEFAULT 0,
    "probabilityPct" REAL NOT NULL DEFAULT 0,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "postsToBudget" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrder_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChangeOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeOrderId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitCost" REAL NOT NULL DEFAULT 0,
    "amount" REAL NOT NULL DEFAULT 0,
    "markupPct" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChangeOrderLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SovLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costCodeId" TEXT,
    "scheduledValue" REAL NOT NULL DEFAULT 0,
    "changeOrderNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SovLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SovLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OwnerBilling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "appNumber" INTEGER NOT NULL,
    "periodTo" DATETIME NOT NULL,
    "dateSubmitted" DATETIME,
    "dateApproved" DATETIME,
    "datePaid" DATETIME,
    "retainagePct" REAL NOT NULL DEFAULT 0.05,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OwnerBilling_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OwnerBillingLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billingId" TEXT NOT NULL,
    "sovLineId" TEXT NOT NULL,
    "workThisPeriod" REAL NOT NULL DEFAULT 0,
    "storedMaterials" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "OwnerBillingLine_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "OwnerBilling" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OwnerBillingLine_sovLineId_fkey" FOREIGN KEY ("sovLineId") REFERENCES "SovLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "vendorId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "periodEnd" DATETIME,
    "amount" REAL NOT NULL DEFAULT 0,
    "retentionPct" REAL NOT NULL DEFAULT 0.05,
    "dateReceived" DATETIME,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "dateApproved" DATETIME,
    "amountPaid" REAL NOT NULL DEFAULT 0,
    "datePaid" DATETIME,
    "lienWaiverReceived" BOOLEAN NOT NULL DEFAULT false,
    "attachmentName" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubInvoice_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SubInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubInvoice_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForecastPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ForecastPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ForecastLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "currentBudget" REAL NOT NULL DEFAULT 0,
    "costToDate" REAL NOT NULL DEFAULT 0,
    "committed" REAL NOT NULL DEFAULT 0,
    "accrued" REAL NOT NULL DEFAULT 0,
    "remainingCommitment" REAL NOT NULL DEFAULT 0,
    "pctComplete" REAL NOT NULL DEFAULT 0,
    "etcOverride" REAL,
    "estimateToComplete" REAL NOT NULL DEFAULT 0,
    "estimateAtCompletion" REAL NOT NULL DEFAULT 0,
    "previousEac" REAL NOT NULL DEFAULT 0,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "confidence" REAL NOT NULL DEFAULT 0.8,
    "note" TEXT,
    CONSTRAINT "ForecastLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ForecastPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForecastLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashFlowPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "plannedDeltaPct" REAL NOT NULL DEFAULT 0,
    "actualPctComplete" REAL,
    "actualCost" REAL,
    "billingOverride" REAL,
    "collectionOverride" REAL,
    "notes" TEXT,
    CONSTRAINT "CashFlowPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuantityItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "budgetQty" REAL NOT NULL DEFAULT 0,
    "budgetUnitRate" REAL NOT NULL DEFAULT 0,
    "targetFinish" DATETIME,
    "materialOrderedQty" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "QuantityItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuantityItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuantityEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "installedQty" REAL NOT NULL DEFAULT 0,
    "actualHours" REAL NOT NULL DEFAULT 0,
    "crewDays" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "QuantityEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuantityItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "label" TEXT,
    "payload" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyMonthly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "month" DATETIME NOT NULL,
    "billings" REAL NOT NULL DEFAULT 0,
    "costs" REAL NOT NULL DEFAULT 0,
    "cashIn" REAL NOT NULL DEFAULT 0,
    "cashOut" REAL NOT NULL DEFAULT 0,
    "overhead" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "CompanyMonthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArAgingBucket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "asOf" DATETIME NOT NULL,
    "bucket" TEXT NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ArAgingBucket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entity_entityId_idx" ON "AuditLog"("companyId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CsiDivision_companyId_idx" ON "CsiDivision"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CsiDivision_companyId_code_key" ON "CsiDivision"("companyId", "code");

-- CreateIndex
CREATE INDEX "Trade_companyId_idx" ON "Trade"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_companyId_name_key" ON "Trade"("companyId", "name");

-- CreateIndex
CREATE INDEX "CostCode_companyId_idx" ON "CostCode"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_companyId_code_key" ON "CostCode"("companyId", "code");

-- CreateIndex
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

-- CreateIndex
CREATE INDEX "Vendor_companyId_idx" ON "Vendor"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_companyId_name_key" ON "Vendor"("companyId", "name");

-- CreateIndex
CREATE INDEX "Bid_companyId_status_idx" ON "Bid"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bid_companyId_number_key" ON "Bid"("companyId", "number");

-- CreateIndex
CREATE INDEX "Estimate_companyId_status_idx" ON "Estimate"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LaborRate_estimateId_className_key" ON "LaborRate"("estimateId", "className");

-- CreateIndex
CREATE INDEX "EstimateSection_estimateId_idx" ON "EstimateSection"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateItem_estimateId_idx" ON "EstimateItem"("estimateId");

-- CreateIndex
CREATE INDEX "GeneralConditionItem_estimateId_idx" ON "GeneralConditionItem"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateAlternate_estimateId_idx" ON "EstimateAlternate"("estimateId");

-- CreateIndex
CREATE INDEX "EstimateClarification_estimateId_idx" ON "EstimateClarification"("estimateId");

-- CreateIndex
CREATE INDEX "BidPackage_estimateId_idx" ON "BidPackage"("estimateId");

-- CreateIndex
CREATE INDEX "BidPackage_projectId_idx" ON "BidPackage"("projectId");

-- CreateIndex
CREATE INDEX "BidPackageQuote_packageId_idx" ON "BidPackageQuote"("packageId");

-- CreateIndex
CREATE INDEX "Project_companyId_status_idx" ON "Project"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Project_companyId_number_key" ON "Project"("companyId", "number");

-- CreateIndex
CREATE INDEX "BudgetLine_projectId_idx" ON "BudgetLine"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_projectId_costCodeId_key" ON "BudgetLine"("projectId", "costCodeId");

-- CreateIndex
CREATE INDEX "BudgetRevision_projectId_idx" ON "BudgetRevision"("projectId");

-- CreateIndex
CREATE INDEX "BudgetRevision_budgetLineId_idx" ON "BudgetRevision"("budgetLineId");

-- CreateIndex
CREATE INDEX "Commitment_projectId_idx" ON "Commitment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Commitment_projectId_number_key" ON "Commitment"("projectId", "number");

-- CreateIndex
CREATE INDEX "CommitmentLine_commitmentId_idx" ON "CommitmentLine"("commitmentId");

-- CreateIndex
CREATE INDEX "CommitmentChange_commitmentId_idx" ON "CommitmentChange"("commitmentId");

-- CreateIndex
CREATE INDEX "CostTransaction_projectId_date_idx" ON "CostTransaction"("projectId", "date");

-- CreateIndex
CREATE INDEX "CostTransaction_projectId_costCodeId_idx" ON "CostTransaction"("projectId", "costCodeId");

-- CreateIndex
CREATE INDEX "CostTransaction_importHash_idx" ON "CostTransaction"("importHash");

-- CreateIndex
CREATE INDEX "ChangeOrder_projectId_status_idx" ON "ChangeOrder"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_projectId_number_key" ON "ChangeOrder"("projectId", "number");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");

-- CreateIndex
CREATE INDEX "SovLine_projectId_idx" ON "SovLine"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "SovLine_projectId_number_key" ON "SovLine"("projectId", "number");

-- CreateIndex
CREATE INDEX "OwnerBilling_projectId_idx" ON "OwnerBilling"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerBilling_projectId_appNumber_key" ON "OwnerBilling"("projectId", "appNumber");

-- CreateIndex
CREATE INDEX "OwnerBillingLine_billingId_idx" ON "OwnerBillingLine"("billingId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerBillingLine_billingId_sovLineId_key" ON "OwnerBillingLine"("billingId", "sovLineId");

-- CreateIndex
CREATE INDEX "SubInvoice_projectId_idx" ON "SubInvoice"("projectId");

-- CreateIndex
CREATE INDEX "SubInvoice_vendorId_idx" ON "SubInvoice"("vendorId");

-- CreateIndex
CREATE INDEX "ForecastPeriod_projectId_idx" ON "ForecastPeriod"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastPeriod_projectId_periodEnd_key" ON "ForecastPeriod"("projectId", "periodEnd");

-- CreateIndex
CREATE INDEX "ForecastLine_periodId_idx" ON "ForecastLine"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastLine_periodId_costCodeId_key" ON "ForecastLine"("periodId", "costCodeId");

-- CreateIndex
CREATE INDEX "CashFlowPeriod_projectId_idx" ON "CashFlowPeriod"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "CashFlowPeriod_projectId_periodEnd_key" ON "CashFlowPeriod"("projectId", "periodEnd");

-- CreateIndex
CREATE INDEX "QuantityItem_projectId_idx" ON "QuantityItem"("projectId");

-- CreateIndex
CREATE INDEX "QuantityEntry_itemId_idx" ON "QuantityEntry"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "QuantityEntry_itemId_periodEnd_key" ON "QuantityEntry"("itemId", "periodEnd");

-- CreateIndex
CREATE INDEX "ProjectSnapshot_projectId_idx" ON "ProjectSnapshot"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSnapshot_projectId_asOf_key" ON "ProjectSnapshot"("projectId", "asOf");

-- CreateIndex
CREATE INDEX "CompanyMonthly_companyId_idx" ON "CompanyMonthly"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMonthly_companyId_month_key" ON "CompanyMonthly"("companyId", "month");

-- CreateIndex
CREATE INDEX "ArAgingBucket_companyId_idx" ON "ArAgingBucket"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ArAgingBucket_companyId_asOf_bucket_key" ON "ArAgingBucket"("companyId", "asOf", "bucket");
