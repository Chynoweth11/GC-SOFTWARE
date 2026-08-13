-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'EXECUTIVE', 'PROJECT_MANAGER', 'PROJECT_ENGINEER', 'ESTIMATOR', 'ACCOUNTING', 'FINANCE', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('LABOR', 'MATERIAL', 'EQUIPMENT', 'SUBCONTRACT', 'GENERAL_CONDITIONS', 'OVERHEAD', 'CONTINGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'PUBLIC', 'DEVELOPER', 'INSTITUTIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('LEAD', 'QUALIFYING', 'ESTIMATING', 'SUBMITTED', 'PENDING_DECISION', 'ON_HOLD', 'WON', 'LOST', 'NO_BID', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'SUBMITTED', 'AWARDED', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MeasureType" AS ENUM ('EA', 'LF', 'SF', 'SY', 'CY', 'CF', 'TON', 'LB', 'HR', 'DAY', 'LS', 'ALLOWANCE');

-- CreateEnum
CREATE TYPE "BuyoutStatus" AS ENUM ('BIDDING', 'LEVELED', 'AWARDED', 'BOUGHT_OUT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'RECEIVED', 'DECLINED', 'NO_BID');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('BIDDING', 'AWARDED', 'PRECONSTRUCTION', 'UNDER_CONSTRUCTION', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EacMethod" AS ENUM ('BOTTOM_UP', 'CPI_BASED', 'BUDGET_RATE');

-- CreateEnum
CREATE TYPE "PocMethod" AS ENUM ('COST_TO_COST', 'QUANTITY', 'SUBCONTRACTOR_PROGRESS', 'SCHEDULE', 'MANUAL', 'EARNED_VALUE', 'BILLING');

-- CreateEnum
CREATE TYPE "BudgetRevisionType" AS ENUM ('CHANGE_ORDER', 'TRANSFER', 'REVISION', 'CONTINGENCY_DRAW');

-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM ('SUBCONTRACT', 'PURCHASE_ORDER', 'MATERIAL', 'EQUIPMENT', 'SERVICE');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('DRAFT', 'ISSUED', 'EXECUTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommitmentChangeStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOID');

-- CreateEnum
CREATE TYPE "CostTxType" AS ENUM ('ACTUAL', 'ACCRUAL', 'COMMITTED_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CostTxSource" AS ENUM ('MANUAL', 'IMPORT', 'SUB_INVOICE', 'PAYROLL', 'PURCHASE_ORDER', 'JOURNAL');

-- CreateEnum
CREATE TYPE "ChangeOrderType" AS ENUM ('OWNER_REQUEST', 'DESIGN_CHANGE', 'FIELD_CONDITION', 'ALLOWANCE_RECONCILE', 'ASI_DRIVEN', 'BACKCHARGE', 'TIME_ONLY', 'INTERNAL_BUDGET');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('CHANGE_ORDER', 'CONTRACT', 'CONTRACT_AMENDMENT', 'ADDENDUM', 'TIME_AND_MATERIALS', 'OWNER_CHANGE', 'SUBCONTRACT_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'READY_TO_SEND', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'FULLY_SIGNED', 'APPROVED', 'REJECTED', 'CANCELLED', 'VOIDED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('AWAITING', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "DocumentAttachmentKind" AS ENUM ('SIGNED_DOCUMENT', 'UNSIGNED_DOCUMENT', 'PRICING_BACKUP', 'SUBCONTRACTOR_QUOTE', 'CORRESPONDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "ForecastStatus" AS ENUM ('OPEN', 'LOCKED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "WorkersCompBasis" AS ENUM ('PER_HOUR', 'PER_100_PAYROLL');

-- CreateEnum
CREATE TYPE "PayBasis" AS ENUM ('HOURLY', 'SALARY');

-- CreateEnum
CREATE TYPE "LaborKind" AS ENUM ('FIELD', 'STAFF');

-- CreateEnum
CREATE TYPE "AssignmentBasis" AS ENUM ('HOURS', 'ALLOCATION');

-- CreateEnum
CREATE TYPE "OverheadCategory" AS ENUM ('OFFICE', 'VEHICLES', 'SOFTWARE', 'INSURANCE', 'EQUIPMENT', 'PROFESSIONAL', 'MARKETING', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "OverheadPeriod" AS ENUM ('MONTHLY', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "ComplianceKind" AS ENUM ('CERTIFIED_PAYROLL', 'PREVAILING_WAGE_POSTING', 'FRINGE_BENEFIT_STATEMENT', 'APPRENTICESHIP_UTILIZATION', 'EEO_REPORT', 'WAGE_DETERMINATION_UPDATE', 'INTENT_OR_AFFIDAVIT', 'OSHA_LOG', 'INSURANCE_CERTIFICATE', 'LICENSE_OR_REGISTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplianceFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "EquipmentOwnership" AS ENUM ('OWNED', 'RENTED', 'OPERATOR_PROVIDED');

-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "phone" TEXT,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "targetMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 0.16,
    "defaultRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "defaultLaborBurdenPct" DOUBLE PRECISION NOT NULL DEFAULT 0.34,
    "defaultOverheadPct" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "futaPct" DOUBLE PRECISION NOT NULL DEFAULT 0.006,
    "ficaPct" DOUBLE PRECISION NOT NULL DEFAULT 0.0765,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'READ_ONLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ipAddress" TEXT,
    "successful" BOOLEAN NOT NULL DEFAULT false,
    "refusedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CsiDivision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CsiDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "divisionId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "divisionId" TEXT,
    "tradeId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CostCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRegion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
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
    "glExpiration" TIMESTAMP(3),
    "wcExpiration" TIMESTAMP(3),
    "autoExpiration" TIMESTAMP(3),
    "umbrellaExpiration" TIMESTAMP(3),
    "bondRequired" BOOLEAN NOT NULL DEFAULT false,
    "bondStatus" TEXT,
    "paymentHold" BOOLEAN NOT NULL DEFAULT false,
    "paymentHoldReason" TEXT,
    "performanceRating" DOUBLE PRECISION,
    "safetyRating" DOUBLE PRECISION,
    "qualityRating" DOUBLE PRECISION,
    "scheduleRating" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "clientContact" TEXT,
    "clientPhone" TEXT,
    "clientType" "ClientType" NOT NULL DEFAULT 'OTHER',
    "leadSource" TEXT,
    "location" TEXT,
    "estimator" TEXT,
    "dateReceived" TIMESTAMP(3),
    "bidDue" TIMESTAMP(3),
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "submittedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateSubmitted" TIMESTAMP(3),
    "status" "BidStatus" NOT NULL DEFAULT 'LEAD',
    "winProbability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastContact" TIMESTAMP(3),
    "nextFollowUp" TIMESTAMP(3),
    "touches" INTEGER NOT NULL DEFAULT 0,
    "nextAction" TEXT,
    "decisionDate" TIMESTAMP(3),
    "outcomeReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bidId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "clientName" TEXT,
    "architect" TEXT,
    "address" TEXT,
    "projectType" TEXT,
    "bidDueDate" TIMESTAMP(3),
    "estimator" TEXT,
    "drawingSet" TEXT,
    "addenda" TEXT,
    "durationWeeks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "buildingAreaSf" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborBurdenPct" DOUBLE PRECISION NOT NULL DEFAULT 0.34,
    "salesTaxPct" DOUBLE PRECISION NOT NULL DEFAULT 0.086,
    "smallToolsPct" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 0.03,
    "overheadPct" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "profitPct" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "glInsurancePct" DOUBLE PRECISION NOT NULL DEFAULT 0.012,
    "bondPct" DOUBLE PRECISION NOT NULL DEFAULT 0.01,
    "exciseTaxPct" DOUBLE PRECISION NOT NULL DEFAULT 0.005,
    "roundToNearest" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRate" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "rate" DOUBLE PRECISION,
    "classificationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateSection" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "sectionId" TEXT,
    "divisionId" TEXT,
    "description" TEXT NOT NULL,
    "drawingRef" TEXT,
    "measure" "MeasureType" NOT NULL DEFAULT 'EA',
    "count" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netQtyOverride" DOUBLE PRECISION,
    "uom" TEXT,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborClass" TEXT,
    "laborHrsPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborRateOverride" DOUBLE PRECISION,
    "equipmentClass" TEXT,
    "equipmentHrsPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentRateOverride" DOUBLE PRECISION,
    "materialUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneralConditionItem" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "basis" TEXT NOT NULL DEFAULT 'LS',
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "followsDuration" BOOLEAN NOT NULL DEFAULT false,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GeneralConditionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateAlternate" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateAlternate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateClarification" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPackage" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT,
    "projectId" TEXT,
    "tradeId" TEXT,
    "name" TEXT NOT NULL,
    "divisionCode" TEXT,
    "budgetAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carriedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "awardedVendorId" TEXT,
    "awardAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BuyoutStatus" NOT NULL DEFAULT 'BIDDING',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BidPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BidPackageQuote" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "vendorId" TEXT,
    "vendorName" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inclusions" TEXT,
    "exclusions" TEXT,
    "qualifications" TEXT,
    "allowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BidPackageQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
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
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "noticeToProceed" TIMESTAMP(3),
    "contractStart" TIMESTAMP(3),
    "contractCompletion" TIMESTAMP(3),
    "forecastCompletion" TIMESTAMP(3),
    "dataDate" TIMESTAMP(3),
    "originalContractSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownerRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "defaultSubRetentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "targetMarginPct" DOUBLE PRECISION NOT NULL DEFAULT 0.18,
    "laborBurdenPct" DOUBLE PRECISION NOT NULL DEFAULT 0.34,
    "overheadPct" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "workDaysPerWeek" INTEGER NOT NULL DEFAULT 5,
    "eacMethod" "EacMethod" NOT NULL DEFAULT 'BOTTOM_UP',
    "pocMethod" "PocMethod" NOT NULL DEFAULT 'COST_TO_COST',
    "manualPctComplete" DOUBLE PRECISION,
    "pendingCoInclusionPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safetyScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "clientSatScore" DOUBLE PRECISION,
    "recordablesYtd" INTEGER NOT NULL DEFAULT 0,
    "nearMissesYtd" INTEGER NOT NULL DEFAULT 0,
    "observationsYtd" INTEGER NOT NULL DEFAULT 0,
    "sourceEstimateId" TEXT,
    "sourceBidId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "tradeId" TEXT,
    "originalBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetRevision" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "budgetLineId" TEXT NOT NULL,
    "type" "BudgetRevisionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "changeOrderId" TEXT,
    "transferGroup" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "CommitmentType" NOT NULL DEFAULT 'SUBCONTRACT',
    "number" TEXT NOT NULL,
    "description" TEXT,
    "scopeOfWork" TEXT,
    "originalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'ISSUED',
    "dateIssued" TIMESTAMP(3),
    "dateExecuted" TIMESTAMP(3),
    "expectedDelivery" TIMESTAMP(3),
    "actualDelivery" TIMESTAMP(3),
    "receivedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forecastFinalOverride" DOUBLE PRECISION,
    "pctComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentLine" (
    "id" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CommitmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitmentChange" (
    "id" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CommitmentChangeStatus" NOT NULL DEFAULT 'PENDING',
    "dateSubmitted" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "changeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitmentChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostTransaction" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "CostTxType" NOT NULL DEFAULT 'ACTUAL',
    "source" "CostTxSource" NOT NULL DEFAULT 'MANUAL',
    "vendorId" TEXT,
    "commitmentId" TEXT,
    "subInvoiceId" TEXT,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "hours" DOUBLE PRECISION,
    "needsCoding" BOOLEAN NOT NULL DEFAULT false,
    "importHash" TEXT,
    "attachmentName" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "documentKind" "DocumentKind" NOT NULL DEFAULT 'CHANGE_ORDER',
    "type" "ChangeOrderType" NOT NULL DEFAULT 'OWNER_REQUEST',
    "description" TEXT NOT NULL,
    "origin" TEXT,
    "tradeId" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "counterparty" TEXT,
    "reference" TEXT,
    "dateInitiated" TIMESTAMP(3),
    "dateSubmitted" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "anticipatedApproval" TIMESTAMP(3),
    "sentForSignatureAt" TIMESTAMP(3),
    "fullySignedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvalCertification" TEXT,
    "unapprovedReason" TEXT,
    "priceFromLines" BOOLEAN NOT NULL DEFAULT true,
    "enteredOwnerAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enteredCostAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborBurdenPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesTaxPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "smallToolsPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contingencyPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overheadPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "glInsurancePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bondPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exciseTaxPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roundToNearest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "probabilityPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "postsToBudget" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "rollsUpToId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrderLine" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "category" "CostCategory" NOT NULL,
    "description" TEXT,
    "scope" TEXT,
    "divisionCode" TEXT,
    "measure" "MeasureType" NOT NULL DEFAULT 'LS',
    "count" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netQtyOverride" DOUBLE PRECISION,
    "uom" TEXT,
    "wastePct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborClass" TEXT,
    "laborHrsPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborRateOverride" DOUBLE PRECISION,
    "equipmentClass" TEXT,
    "equipmentHrsPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentRateOverride" DOUBLE PRECISION,
    "materialUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "equipmentUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSignature" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "status" "SignatureStatus" NOT NULL DEFAULT 'AWAITING',
    "signedAt" TIMESTAMP(3),
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAttachment" (
    "id" TEXT NOT NULL,
    "changeOrderId" TEXT NOT NULL,
    "kind" "DocumentAttachmentKind" NOT NULL DEFAULT 'SIGNED_DOCUMENT',
    "fileName" TEXT NOT NULL,
    "location" TEXT,
    "storage" TEXT,
    "storageKey" TEXT,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "checksum" TEXT,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SovLine" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costCodeId" TEXT,
    "scheduledValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "changeOrderNumber" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SovLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerBilling" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "appNumber" INTEGER NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "dateSubmitted" TIMESTAMP(3),
    "dateApproved" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "retainagePct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BillingStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerBilling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerBillingLine" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "sovLineId" TEXT NOT NULL,
    "workThisPeriod" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storedMaterials" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "OwnerBillingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubInvoice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "vendorId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionPct" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "dateReceived" TIMESTAMP(3),
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "dateApproved" TIMESTAMP(3),
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "datePaid" TIMESTAMP(3),
    "lienWaiverReceived" BOOLEAN NOT NULL DEFAULT false,
    "attachmentName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastPeriod" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ForecastStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForecastPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastLine" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "costCodeId" TEXT NOT NULL,
    "currentBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costToDate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "committed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingCommitment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pctComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "etcOverride" DOUBLE PRECISION,
    "estimateToComplete" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimateAtCompletion" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousEac" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "note" TEXT,

    CONSTRAINT "ForecastLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowPeriod" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "plannedDeltaPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualPctComplete" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "billingOverride" DOUBLE PRECISION,
    "collectionOverride" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "CashFlowPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantityItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "costCodeId" TEXT,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "budgetQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "budgetUnitRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetFinish" TIMESTAMP(3),
    "materialOrderedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuantityItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuantityEntry" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "installedQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "crewDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "QuantityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "payload" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMonthly" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "billings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashIn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cashOut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overhead" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "CompanyMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArAgingBucket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "bucket" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ArAgingBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollJurisdiction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sutaPct" DOUBLE PRECISION,
    "sutaWageBase" DOUBLE PRECISION,
    "sutaRateYear" INTEGER,
    "workersCompBasis" "WorkersCompBasis" NOT NULL DEFAULT 'PER_100_PAYROLL',
    "stateFund" BOOLEAN NOT NULL DEFAULT false,
    "wageAuthority" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedNote" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollJurisdiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCounty" (
    "id" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fips" TEXT,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollCounty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WageRateSheet" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jurisdictionId" TEXT NOT NULL,
    "countyId" TEXT,
    "rateScheduleDate" TIMESTAMP(3),
    "determinationRef" TEXT,
    "sutaPctOverride" DOUBLE PRECISION,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WageRateSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WageRateLine" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "classification" TEXT,
    "hourlyWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyBenefits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trainingPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workersCompPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "publishedBaseWage" DOUBLE PRECISION,
    "publishedFringe" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WageRateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborClassification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "kind" "LaborKind" NOT NULL DEFAULT 'FIELD',
    "payBasis" "PayBasis" NOT NULL DEFAULT 'HOURLY',
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "benefitsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualHours" DOUBLE PRECISION NOT NULL DEFAULT 2080,
    "trainingPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workersCompRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jurisdictionId" TEXT,
    "costCategory" "CostCategory" NOT NULL DEFAULT 'LABOR',
    "tradeId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LaborClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLaborAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "label" TEXT,
    "costCodeId" TEXT,
    "basis" "AssignmentBasis" NOT NULL DEFAULT 'ALLOCATION',
    "budgetedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allocationPct" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "loadedRateOverride" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLaborAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OverheadCost" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "OverheadCategory" NOT NULL DEFAULT 'OTHER',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" "OverheadPeriod" NOT NULL DEFAULT 'MONTHLY',
    "incurredOn" TIMESTAMP(3),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverheadCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRequirement" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ComplianceKind" NOT NULL DEFAULT 'CERTIFIED_PAYROLL',
    "title" TEXT NOT NULL,
    "agency" TEXT,
    "frequency" "ComplianceFrequency" NOT NULL DEFAULT 'WEEKLY',
    "firstDueDate" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "leadDays" INTEGER NOT NULL DEFAULT 7,
    "responsibleUserId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceSubmission" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "ownership" "EquipmentOwnership" NOT NULL DEFAULT 'OWNED',
    "hourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weeklyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatingCostPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "standbyRatePerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "daysPerWeek" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "vendorId" TEXT,
    "assetTag" TEXT,
    "costCategory" "CostCategory" NOT NULL DEFAULT 'EQUIPMENT',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEquipmentAssignment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "label" TEXT,
    "costCodeId" TEXT,
    "basis" "RateBasis" NOT NULL DEFAULT 'DAILY',
    "units" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "standbyHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "rateOverride" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "SavedView_companyId_scope_idx" ON "SavedView"("companyId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_userId_scope_name_key" ON "SavedView"("userId", "scope", "name");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key_key" ON "UserPreference"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipAddress_createdAt_idx" ON "LoginAttempt"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_entity_entityId_idx" ON "AuditLog"("companyId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_createdAt_idx" ON "AuditLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_userId_idx" ON "AuditLog"("companyId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_action_idx" ON "AuditLog"("companyId", "action");

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
CREATE INDEX "VendorState_companyId_idx" ON "VendorState"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorState_companyId_name_key" ON "VendorState"("companyId", "name");

-- CreateIndex
CREATE INDEX "VendorRegion_companyId_idx" ON "VendorRegion"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "VendorRegion_stateId_name_key" ON "VendorRegion"("stateId", "name");

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
CREATE INDEX "ChangeOrder_projectId_documentKind_idx" ON "ChangeOrder"("projectId", "documentKind");

-- CreateIndex
CREATE UNIQUE INDEX "ChangeOrder_projectId_number_key" ON "ChangeOrder"("projectId", "number");

-- CreateIndex
CREATE INDEX "ChangeOrderLine_changeOrderId_idx" ON "ChangeOrderLine"("changeOrderId");

-- CreateIndex
CREATE INDEX "DocumentSignature_changeOrderId_idx" ON "DocumentSignature"("changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSignature_changeOrderId_party_key" ON "DocumentSignature"("changeOrderId", "party");

-- CreateIndex
CREATE INDEX "DocumentAttachment_changeOrderId_idx" ON "DocumentAttachment"("changeOrderId");

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

-- CreateIndex
CREATE INDEX "EquipmentItem_companyId_idx" ON "EquipmentItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentItem_companyId_name_key" ON "EquipmentItem"("companyId", "name");

-- CreateIndex
CREATE INDEX "ProjectEquipmentAssignment_projectId_idx" ON "ProjectEquipmentAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ProjectEquipmentAssignment_equipmentItemId_idx" ON "ProjectEquipmentAssignment"("equipmentItemId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CsiDivision" ADD CONSTRAINT "CsiDivision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostCode" ADD CONSTRAINT "CostCode_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorState" ADD CONSTRAINT "VendorState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRegion" ADD CONSTRAINT "VendorRegion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRegion" ADD CONSTRAINT "VendorRegion_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "VendorState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "VendorState"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "VendorRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborRate" ADD CONSTRAINT "LaborRate_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "LaborClassification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateSection" ADD CONSTRAINT "EstimateSection_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "EstimateSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "CsiDivision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneralConditionItem" ADD CONSTRAINT "GeneralConditionItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateAlternate" ADD CONSTRAINT "EstimateAlternate_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateClarification" ADD CONSTRAINT "EstimateClarification_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackage" ADD CONSTRAINT "BidPackage_awardedVendorId_fkey" FOREIGN KEY ("awardedVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackageQuote" ADD CONSTRAINT "BidPackageQuote_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "BidPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BidPackageQuote" ADD CONSTRAINT "BidPackageQuote_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_pmUserId_fkey" FOREIGN KEY ("pmUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_sourceEstimateId_fkey" FOREIGN KEY ("sourceEstimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_sourceBidId_fkey" FOREIGN KEY ("sourceBidId") REFERENCES "Bid"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_budgetLineId_fkey" FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLine" ADD CONSTRAINT "CommitmentLine_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentLine" ADD CONSTRAINT "CommitmentLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentChange" ADD CONSTRAINT "CommitmentChange_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentChange" ADD CONSTRAINT "CommitmentChange_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostTransaction" ADD CONSTRAINT "CostTransaction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostTransaction" ADD CONSTRAINT "CostTransaction_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostTransaction" ADD CONSTRAINT "CostTransaction_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostTransaction" ADD CONSTRAINT "CostTransaction_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostTransaction" ADD CONSTRAINT "CostTransaction_subInvoiceId_fkey" FOREIGN KEY ("subInvoiceId") REFERENCES "SubInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "ChangeOrder_rollsUpToId_fkey" FOREIGN KEY ("rollsUpToId") REFERENCES "ChangeOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeOrderLine" ADD CONSTRAINT "ChangeOrderLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ChangeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SovLine" ADD CONSTRAINT "SovLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SovLine" ADD CONSTRAINT "SovLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBilling" ADD CONSTRAINT "OwnerBilling_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBillingLine" ADD CONSTRAINT "OwnerBillingLine_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "OwnerBilling"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerBillingLine" ADD CONSTRAINT "OwnerBillingLine_sovLineId_fkey" FOREIGN KEY ("sovLineId") REFERENCES "SovLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubInvoice" ADD CONSTRAINT "SubInvoice_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastPeriod" ADD CONSTRAINT "ForecastPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastLine" ADD CONSTRAINT "ForecastLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ForecastPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastLine" ADD CONSTRAINT "ForecastLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowPeriod" ADD CONSTRAINT "CashFlowPeriod_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityItem" ADD CONSTRAINT "QuantityItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityItem" ADD CONSTRAINT "QuantityItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuantityEntry" ADD CONSTRAINT "QuantityEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "QuantityItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectSnapshot" ADD CONSTRAINT "ProjectSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMonthly" ADD CONSTRAINT "CompanyMonthly_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArAgingBucket" ADD CONSTRAINT "ArAgingBucket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollJurisdiction" ADD CONSTRAINT "PayrollJurisdiction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollJurisdiction" ADD CONSTRAINT "PayrollJurisdiction_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCounty" ADD CONSTRAINT "PayrollCounty_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "PayrollJurisdiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCounty" ADD CONSTRAINT "PayrollCounty_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageRateSheet" ADD CONSTRAINT "WageRateSheet_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageRateSheet" ADD CONSTRAINT "WageRateSheet_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "PayrollJurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageRateSheet" ADD CONSTRAINT "WageRateSheet_countyId_fkey" FOREIGN KEY ("countyId") REFERENCES "PayrollCounty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageRateSheet" ADD CONSTRAINT "WageRateSheet_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WageRateLine" ADD CONSTRAINT "WageRateLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "WageRateSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborClassification" ADD CONSTRAINT "LaborClassification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborClassification" ADD CONSTRAINT "LaborClassification_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "PayrollJurisdiction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborClassification" ADD CONSTRAINT "LaborClassification_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "LaborClassification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectLaborAssignment" ADD CONSTRAINT "ProjectLaborAssignment_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverheadCost" ADD CONSTRAINT "OverheadCost_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSubmission" ADD CONSTRAINT "ComplianceSubmission_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "ComplianceRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSubmission" ADD CONSTRAINT "ComplianceSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEquipmentAssignment" ADD CONSTRAINT "ProjectEquipmentAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEquipmentAssignment" ADD CONSTRAINT "ProjectEquipmentAssignment_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEquipmentAssignment" ADD CONSTRAINT "ProjectEquipmentAssignment_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The audit history is permanent.
--
-- The same guarantee the SQLite lineage installs, said the way Postgres says
-- it: a function to raise from, and a trigger on each of the two operations
-- that would rewrite history. The application reinstates these on every start
-- as well, because a trigger is ordinary schema and can be dropped.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The audit history is permanent and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_is_append_only_update ON "AuditLog";
CREATE TRIGGER audit_log_is_append_only_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

DROP TRIGGER IF EXISTS audit_log_is_append_only_delete ON "AuditLog";
CREATE TRIGGER audit_log_is_append_only_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
