export type CostCategory =
  | 'LABOR'
  | 'MATERIAL'
  | 'EQUIPMENT'
  | 'SUBCONTRACT'
  | 'GENERAL_CONDITIONS'
  | 'OVERHEAD'
  | 'CONTINGENCY'
  | 'OTHER'

export type EacMethod = 'BOTTOM_UP' | 'CPI_BASED' | 'BUDGET_RATE'

export type PocMethod =
  | 'COST_TO_COST'
  | 'QUANTITY'
  | 'SUBCONTRACTOR_PROGRESS'
  | 'SCHEDULE'
  | 'MANUAL'
  | 'EARNED_VALUE'
  | 'BILLING'

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

/** Inputs for a single cost-code row of the cost-control table. */
export interface CostLineInput {
  costCodeId: string
  code: string
  description: string
  category: CostCategory
  tradeId?: string | null
  tradeName?: string | null
  divisionCode?: string | null
  divisionName?: string | null
  originalBudget: number
  /** Budget added by approved change orders and internal revisions. */
  budgetRevisions: number
  /** Sum of executed commitment values allocated to this code. */
  committed: number
  /** Invoiced/posted actual cost. */
  costToDate: number
  /** Accrued or pending cost not yet invoiced. */
  accruals: number
  /** Physical percent complete, 0–1. Falls back to % spent when null. */
  pctComplete: number | null
  /** Manager's estimate of remaining cost. Null derives it from budget × remaining %. */
  etcOverride?: number | null
  notes?: string | null
}

/** Fully derived cost-control row: one per cost code. */
export interface CostLine extends CostLineInput {
  currentBudget: number
  totalCostToDate: number
  pctSpent: number
  effectivePctComplete: number
  earnedValue: number
  costVariance: number
  remainingBudget: number
  remainingCommitment: number
  forecastToComplete: number
  forecastAtCompletion: number
  facVariance: number
  overBudget: boolean
}

export interface CategoryRollup {
  category: CostCategory
  currentBudget: number
  costToDate: number
  committed: number
  forecastAtCompletion: number
  facVariance: number
}

export interface EarnedValue {
  budgetAtCompletion: number
  plannedValue: number
  earnedValue: number
  actualCost: number
  costPerformanceIndex: number
  schedulePerformanceIndex: number
  costVariance: number
  scheduleVariance: number
}

export interface EacResult {
  bottomUp: number
  cpiBased: number
  budgetRate: number
  selected: number
  method: EacMethod
  estimateToComplete: number
  varianceAtCompletion: number
}

export interface ContractPosition {
  originalContract: number
  approvedChangeOrders: number
  currentContract: number
  pendingChangeOrders: number
  /** Pending COs weighted by their probability, for the forecast case. */
  weightedPendingChangeOrders: number
  potentialContract: number
  /** Contract used for forecasting = current + included share of pending. */
  forecastContract: number
}

export interface BillingPosition {
  totalCompletedAndStored: number
  retainageHeld: number
  totalEarnedLessRetainage: number
  amountCollected: number
  accountsReceivable: number
  remainingContractBalance: number
  billedPctOfContract: number
  lastAppNumber: number
  lastPeriodTo: Date | null
}

export interface RevenuePosition {
  method: PocMethod
  pctComplete: number
  contractValue: number
  revenueEarned: number
  amountBilled: number
  overbilled: number
  underbilled: number
  remainingRevenue: number
}

export interface CommitmentPosition {
  originalValue: number
  approvedChanges: number
  pendingChanges: number
  currentValue: number
  invoicedToDate: number
  approvedToDate: number
  paidToDate: number
  retentionHeld: number
  outstanding: number
  remainingBalance: number
  forecastFinalCost: number
  buyoutVariance: number
}

export interface ProjectFinancials {
  projectId: string
  dataDate: Date
  contract: ContractPosition
  lines: CostLine[]
  categories: CategoryRollup[]
  originalBudget: number
  currentBudget: number
  costToDate: number
  accruals: number
  totalCostToDate: number
  committed: number
  remainingCommitment: number
  remainingBudget: number
  earnedValue: EarnedValue
  eac: EacResult
  forecastCost: number
  forecastProfit: number
  forecastMargin: number
  marginVsTarget: number
  costVariance: number
  billing: BillingPosition
  revenue: RevenuePosition
  subcontracts: CommitmentPosition
  purchaseOrders: CommitmentPosition
  retentionReceivable: number
  retentionPayable: number
  accountsPayable: number
  backlog: number
  health: ProjectHealth
}

export interface ProjectHealth {
  score: number
  flag: 'OK' | 'WATCH' | 'HIGH RISK'
  scheduleStatus: 'On / Ahead' | 'Behind' | 'Critical' | 'Unknown'
  budgetHealth: 'Healthy' | 'Thin Margin' | 'LOSS'
  daysAheadBehind: number | null
}

export interface CashFlowRow {
  periodEnd: Date
  isActual: boolean
  plannedDeltaPct: number
  plannedCumPct: number
  plannedValue: number
  actualPctComplete: number | null
  earnedValue: number | null
  actualCost: number | null
  forecastCost: number
  totalCost: number
  cumulativeCost: number
  billings: number
  cumulativeBillings: number
  cashIn: number
  cumulativeCash: number
  scheduleVariance: number | null
  overUnderBilled: number | null
  netCash: number
}

export interface CashFlowScenarios {
  expected: CashFlowRow[]
  best: CashFlowRow[]
  worst: CashFlowRow[]
}

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface Alert {
  id: string
  severity: AlertSeverity
  category: string
  title: string
  detail: string
  projectId?: string
  projectNumber?: string
  projectName?: string
  href?: string
  value?: number
}
