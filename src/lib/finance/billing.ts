import { clampPct, num, safeDiv, sumBy } from './core'
import type { BillingPosition, PocMethod, RevenuePosition } from './types'

export interface SovLineInput {
  id: string
  number: string
  description: string
  scheduledValue: number
  costCodeId?: string | null
  changeOrderNumber?: string | null
}

export interface BillingLineInput {
  sovLineId: string
  workThisPeriod: number
  storedMaterials: number
}

export interface BillingInput {
  id: string
  appNumber: number
  periodTo: Date
  dateSubmitted: Date | null
  dateApproved: Date | null
  datePaid: Date | null
  retainagePct: number
  amountPaid: number
  status: string
  lines: BillingLineInput[]
}

/** A single AIA G702 line with its running prior-period totals. */
export interface G702Line {
  sovLineId: string
  number: string
  description: string
  scheduledValue: number
  fromPreviousApplication: number
  workThisPeriod: number
  storedMaterials: number
  totalCompletedAndStored: number
  pctComplete: number
  balanceToFinish: number
  retainage: number
}

export interface G702 {
  appNumber: number
  periodTo: Date
  originalContract: number
  netChangeByChangeOrders: number
  contractSumToDate: number
  totalCompletedAndStored: number
  pctComplete: number
  retainagePct: number
  retainage: number
  totalEarnedLessRetainage: number
  lessPreviousCertificates: number
  currentPaymentDue: number
  balanceToFinishIncludingRetainage: number
  lines: G702Line[]
  amountPaid: number
  arOutstanding: number
  daysOutstanding: number | null
  status: string
}

/**
 * Builds a full AIA G702/G703 application.
 *
 * Workbook source: Owner Billings ▸ D6:S41.
 *   F  Contract Sum to Date        = Original + Net Change by COs
 *   H  % Complete                  = Total Completed & Stored ÷ Contract Sum
 *   J  Retainage                   = Total Completed & Stored × Retainage %
 *   K  Total Earned Less Retainage = Total Completed & Stored − Retainage
 *   L  Less Previous Certificates  = prior application's K
 *   M  Current Payment Due         = K − L
 *   N  Balance to Finish           = Contract Sum − K
 *   R  AR Outstanding              = Current Payment Due − Amount Paid
 *
 * Prior-period values come from summing every earlier application's lines
 * rather than trusting a stored figure, so a corrected back-application
 * flows forward automatically.
 */
export function buildG702(
  application: BillingInput,
  allApplications: readonly BillingInput[],
  sovLines: readonly SovLineInput[],
  originalContract: number,
  approvedChangeOrders: number,
  dataDate: Date,
): G702 {
  const priorApps = allApplications.filter((a) => a.appNumber < application.appNumber)

  const priorBySov = new Map<string, number>()
  for (const app of priorApps) {
    for (const line of app.lines) {
      priorBySov.set(
        line.sovLineId,
        (priorBySov.get(line.sovLineId) ?? 0) + num(line.workThisPeriod) + num(line.storedMaterials),
      )
    }
  }

  const currentBySov = new Map<string, BillingLineInput>()
  for (const line of application.lines) currentBySov.set(line.sovLineId, line)

  const lines: G702Line[] = sovLines.map((sov) => {
    const current = currentBySov.get(sov.id)
    const fromPrevious = priorBySov.get(sov.id) ?? 0
    const workThisPeriod = num(current?.workThisPeriod)
    const storedMaterials = num(current?.storedMaterials)
    const totalCompletedAndStored = fromPrevious + workThisPeriod + storedMaterials
    return {
      sovLineId: sov.id,
      number: sov.number,
      description: sov.description,
      scheduledValue: num(sov.scheduledValue),
      fromPreviousApplication: fromPrevious,
      workThisPeriod,
      storedMaterials,
      totalCompletedAndStored,
      pctComplete: safeDiv(totalCompletedAndStored, num(sov.scheduledValue)),
      balanceToFinish: num(sov.scheduledValue) - totalCompletedAndStored,
      retainage: totalCompletedAndStored * num(application.retainagePct),
    }
  })

  const contractSumToDate = num(originalContract) + num(approvedChangeOrders)
  const totalCompletedAndStored = sumBy(lines, (l) => l.totalCompletedAndStored)
  const retainage = totalCompletedAndStored * num(application.retainagePct)
  const totalEarnedLessRetainage = totalCompletedAndStored - retainage

  const lessPreviousCertificates = priorApps.reduce((acc, app) => {
    const appTotal = sumBy(app.lines, (l) => num(l.workThisPeriod) + num(l.storedMaterials))
    const priorOfPrior = allApplications
      .filter((a) => a.appNumber < app.appNumber)
      .reduce((s, a) => s + sumBy(a.lines, (l) => num(l.workThisPeriod) + num(l.storedMaterials)), 0)
    const cumulative = appTotal + priorOfPrior
    return Math.max(acc, cumulative - cumulative * num(app.retainagePct))
  }, 0)

  const currentPaymentDue = totalEarnedLessRetainage - lessPreviousCertificates
  const arOutstanding = currentPaymentDue - num(application.amountPaid)

  const referenceDate = application.datePaid ?? dataDate
  const daysOutstanding = application.dateSubmitted
    ? Math.round((referenceDate.getTime() - application.dateSubmitted.getTime()) / 86_400_000)
    : null

  return {
    appNumber: application.appNumber,
    periodTo: application.periodTo,
    originalContract: num(originalContract),
    netChangeByChangeOrders: num(approvedChangeOrders),
    contractSumToDate,
    totalCompletedAndStored,
    pctComplete: safeDiv(totalCompletedAndStored, contractSumToDate),
    retainagePct: num(application.retainagePct),
    retainage,
    totalEarnedLessRetainage,
    lessPreviousCertificates,
    currentPaymentDue,
    balanceToFinishIncludingRetainage: contractSumToDate - totalEarnedLessRetainage,
    lines,
    amountPaid: num(application.amountPaid),
    arOutstanding,
    daysOutstanding,
    status: application.status,
  }
}

/**
 * Project-level billing position: the latest application plus AR across all of them.
 * Billed-to-date is the maximum cumulative completed-and-stored (Roll-Up ▸ R6), not a
 * sum, because each application restates the cumulative figure.
 */
export function computeBillingPosition(
  applications: readonly BillingInput[],
  sovLines: readonly SovLineInput[],
  originalContract: number,
  approvedChangeOrders: number,
  dataDate: Date,
): BillingPosition {
  if (applications.length === 0) {
    const contract = num(originalContract) + num(approvedChangeOrders)
    return {
      totalCompletedAndStored: 0,
      retainageHeld: 0,
      totalEarnedLessRetainage: 0,
      amountCollected: 0,
      accountsReceivable: 0,
      remainingContractBalance: contract,
      billedPctOfContract: 0,
      lastAppNumber: 0,
      lastPeriodTo: null,
    }
  }

  const sorted = [...applications].sort((a, b) => a.appNumber - b.appNumber)
  const g702s = sorted.map((app) =>
    buildG702(app, sorted, sovLines, originalContract, approvedChangeOrders, dataDate),
  )
  const latest = g702s[g702s.length - 1]

  const amountCollected = sumBy(sorted, (a) => a.amountPaid)
  const accountsReceivable = sumBy(g702s, (g) => Math.max(0, g.arOutstanding))
  const contractSum = latest.contractSumToDate

  return {
    totalCompletedAndStored: latest.totalCompletedAndStored,
    retainageHeld: latest.retainage,
    totalEarnedLessRetainage: latest.totalEarnedLessRetainage,
    amountCollected,
    accountsReceivable,
    remainingContractBalance: contractSum - latest.totalCompletedAndStored,
    billedPctOfContract: safeDiv(latest.totalCompletedAndStored, contractSum),
    lastAppNumber: latest.appNumber,
    lastPeriodTo: latest.periodTo,
  }
}

export interface PocInputs {
  method: PocMethod
  costToDate: number
  forecastCost: number
  quantityPctComplete: number | null
  subcontractorPctComplete: number | null
  schedulePctComplete: number | null
  manualPctComplete: number | null
  earnedValue: number
  budgetAtCompletion: number
  amountBilled: number
  contractValue: number
}

/**
 * Percentage of completion and the revenue it earns.
 *
 * Cost-to-cost (the default and the most defensible under ASC 606) is
 * cost incurred ÷ forecast final cost. Every other method is a direct
 * measure that overrides it. Revenue earned = contract × % complete;
 * over/under billing is the difference against what has been billed.
 */
export function computePercentComplete(inputs: PocInputs): number {
  switch (inputs.method) {
    case 'QUANTITY':
      return clampPct(inputs.quantityPctComplete ?? 0)
    case 'SUBCONTRACTOR_PROGRESS':
      return clampPct(inputs.subcontractorPctComplete ?? 0)
    case 'SCHEDULE':
      return clampPct(inputs.schedulePctComplete ?? 0)
    case 'MANUAL':
      return clampPct(inputs.manualPctComplete ?? 0)
    case 'EARNED_VALUE':
      return clampPct(safeDiv(inputs.earnedValue, inputs.budgetAtCompletion))
    case 'BILLING':
      return clampPct(safeDiv(inputs.amountBilled, inputs.contractValue))
    case 'COST_TO_COST':
    default:
      return clampPct(safeDiv(inputs.costToDate, inputs.forecastCost))
  }
}

export function computeRevenuePosition(inputs: PocInputs): RevenuePosition {
  const pctComplete = computePercentComplete(inputs)
  const contractValue = num(inputs.contractValue)
  const revenueEarned = contractValue * pctComplete
  const amountBilled = num(inputs.amountBilled)
  const difference = amountBilled - revenueEarned

  return {
    method: inputs.method,
    pctComplete,
    contractValue,
    revenueEarned,
    amountBilled,
    overbilled: Math.max(0, difference),
    underbilled: Math.max(0, -difference),
    remainingRevenue: contractValue - revenueEarned,
  }
}
