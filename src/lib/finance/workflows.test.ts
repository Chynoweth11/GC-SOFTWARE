import { describe, expect, it } from 'vitest'
import {
  changeOrderSummary,
  computeContractPosition,
  deriveChangeOrder,
  type ChangeOrderInput,
} from './changeOrders'
import { deriveCommitment, paymentStatus, type CommitmentInput } from './commitments'
import { levelPackage, levelingSummary, type PackageInput } from './leveling'
import { buildCashFlow, buildCashFlowScenarios, defaultCurve, type CashFlowPeriodInput } from './cashflow'
import { computeHealth, deriveQuantityProgress } from './project'
import { endOfMonth, monthEndsBetween } from './dates'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)
const DATA_DATE = D('2026-03-31')

// ── Change orders ─────────────────────────────────────────────────────────

const co = (over: Partial<ChangeOrderInput> = {}): ChangeOrderInput => ({
  id: 'c',
  number: 'CO-001',
  status: 'APPROVED',
  type: 'OWNER_REQUEST',
  ownerAmount: 0,
  costAmount: 0,
  probabilityPct: 0,
  dateInitiated: null,
  dateApproved: null,
  scheduleImpactDays: 0,
  ...over,
})

describe('change orders: Change Orders J,K,N and Setup C24:C28', () => {
  it('margin and margin percent match the workbook rows', () => {
    const roof = deriveChangeOrder(co({ ownerAmount: 38_000, costAmount: 30_400, dateInitiated: D('2026-01-19'), dateApproved: D('2026-02-03') }), DATA_DATE)
    expect(roof.margin).toBe(7_600)
    expect(roof.marginPct).toBeCloseTo(0.2, 12)
    expect(roof.daysPending).toBe(15)

    const rock = deriveChangeOrder(co({ ownerAmount: 8_500, costAmount: 6_500, dateInitiated: D('2026-02-06'), dateApproved: D('2026-02-20') }), DATA_DATE)
    expect(rock.marginPct).toBeCloseTo(0.235294117647059, 12)
    expect(rock.daysPending).toBe(14)
  })

  it('a pending change order ages against the data date', () => {
    const pending = deriveChangeOrder(co({ status: 'PENDING', dateInitiated: D('2026-03-01') }), DATA_DATE)
    expect(pending.daysPending).toBe(30)
    expect(pending.isPending).toBe(true)
    expect(pending.isApproved).toBe(false)
  })

  it('contract position reproduces Setup C25:C28 for job 26-001', () => {
    const orders = [
      deriveChangeOrder(co({ ownerAmount: 38_000, costAmount: 30_400 }), DATA_DATE),
      deriveChangeOrder(co({ id: 'c2', ownerAmount: 8_500, costAmount: 6_500 }), DATA_DATE),
      deriveChangeOrder(co({ id: 'c3', ownerAmount: 21_500, costAmount: 17_200 }), DATA_DATE),
      deriveChangeOrder(co({ id: 'c4', status: 'PENDING', ownerAmount: 46_700, costAmount: 38_000, probabilityPct: 0.5 }), DATA_DATE),
      deriveChangeOrder(co({ id: 'c5', status: 'SUBMITTED', ownerAmount: 31_500, costAmount: 26_000, probabilityPct: 0.8 }), DATA_DATE),
    ]
    const position = computeContractPosition(2_450_000, orders)
    expect(position.approvedChangeOrders).toBe(68_000)
    expect(position.currentContract).toBe(2_518_000)
    expect(position.pendingChangeOrders).toBe(78_200)
    expect(position.potentialContract).toBe(2_596_200)
  })

  it('pending exposure only enters the forecast when management includes it', () => {
    const orders = [deriveChangeOrder(co({ status: 'PENDING', ownerAmount: 100_000, probabilityPct: 0.6 }), DATA_DATE)]
    expect(computeContractPosition(1_000_000, orders, 0).forecastContract).toBe(1_000_000)
    expect(computeContractPosition(1_000_000, orders, 1).forecastContract).toBe(1_060_000)
    expect(computeContractPosition(1_000_000, orders, 0.5).forecastContract).toBe(1_030_000)
  })

  it('rejected and void orders are excluded from both contract figures', () => {
    const orders = [
      deriveChangeOrder(co({ status: 'REJECTED', ownerAmount: 50_000 }), DATA_DATE),
      deriveChangeOrder(co({ id: 'v', status: 'VOID', ownerAmount: 25_000 }), DATA_DATE),
    ]
    const position = computeContractPosition(1_000_000, orders)
    expect(position.currentContract).toBe(1_000_000)
    expect(position.potentialContract).toBe(1_000_000)
    expect(changeOrderSummary(orders).rejectedValue).toBe(75_000)
  })

  it('EXECUTED counts as approved', () => {
    const orders = [deriveChangeOrder(co({ status: 'EXECUTED', ownerAmount: 10_000 }), DATA_DATE)]
    expect(computeContractPosition(0, orders).approvedChangeOrders).toBe(10_000)
  })
})

// ── Commitments and sub payments ──────────────────────────────────────────

const commitment = (over: Partial<CommitmentInput> = {}): CommitmentInput => ({
  id: 'k',
  number: '26-001-SC-02',
  type: 'SUBCONTRACT',
  vendorId: 'v',
  vendorName: 'Basalt Site Works',
  originalAmount: 286_000,
  retentionPct: 0.05,
  pctComplete: 0.62,
  status: 'EXECUTED',
  forecastFinalOverride: null,
  budgetAmount: 292_500,
  changes: [{ amount: 6_500, status: 'APPROVED' }],
  invoices: [],
  ...over,
})

describe('commitments: Subcontractors O-W', () => {
  it('reproduces the Basalt Site Works row', () => {
    const derived = deriveCommitment(
      commitment({
        invoices: [
          { amount: 62_000, retentionPct: 0.05, approved: true, amountPaid: 58_900, dateReceived: D('2026-02-03'), datePaid: D('2026-02-20'), lienWaiverReceived: true },
          { amount: 71_400, retentionPct: 0.05, approved: true, amountPaid: 67_830, dateReceived: D('2026-03-03'), datePaid: D('2026-03-19'), lienWaiverReceived: true },
          { amount: 47_950, retentionPct: 0.05, approved: true, amountPaid: 0, dateReceived: D('2026-03-30'), datePaid: null, lienWaiverReceived: false },
        ],
      }),
    )
    expect(derived.currentValue).toBe(292_500)
    expect(derived.earnedToDate).toBeCloseTo(181_350, 6)
    expect(derived.remainingBalance).toBeCloseTo(111_150, 6)
    expect(derived.invoicedToDate).toBe(181_350)
    expect(derived.paidToDate).toBe(126_730)
    expect(derived.retentionHeld).toBeCloseTo(9_067.5, 6)
    expect(derived.outstanding).toBeCloseTo(45_552.5, 6)
  })

  it('buyout variance compares the budget to the awarded value', () => {
    const derived = deriveCommitment(commitment({ originalAmount: 287_000, budgetAmount: 292_500, changes: [] }))
    expect(derived.buyoutVariance).toBe(5_500)
  })

  it('a forecast override surfaces the overrun risk', () => {
    const derived = deriveCommitment(commitment({ forecastFinalOverride: 310_000 }))
    expect(derived.forecastFinalCost).toBe(310_000)
    expect(derived.overrunRisk).toBe(17_500)
  })

  it('pending subcontract changes stay out of the current value', () => {
    const derived = deriveCommitment(commitment({ changes: [{ amount: 6_500, status: 'APPROVED' }, { amount: 18_500, status: 'PENDING' }] }))
    expect(derived.currentValue).toBe(292_500)
    expect(derived.pendingChanges).toBe(18_500)
  })
})

describe('payment status: Sub Payments S', () => {
  const invoice = { amount: 62_000, retentionPct: 0.05, approved: true, amountPaid: 0, dateReceived: D('2026-02-03'), datePaid: null, lienWaiverReceived: false }

  it('a fully paid invoice reads PAID', () => {
    expect(paymentStatus({ ...invoice, amountPaid: 58_900, datePaid: D('2026-02-20') }, DATA_DATE).status).toBe('PAID')
  })

  it('an unpaid invoice past 30 days reads OVERDUE', () => {
    const result = paymentStatus(invoice, DATA_DATE)
    expect(result.status).toBe('OVERDUE')
    expect(result.daysOutstanding).toBe(56)
  })

  it('a recent unpaid invoice reads UNPAID, and a part payment reads PARTIAL', () => {
    expect(paymentStatus({ ...invoice, dateReceived: D('2026-03-20') }, DATA_DATE).status).toBe('UNPAID')
    expect(paymentStatus({ ...invoice, dateReceived: D('2026-03-20'), amountPaid: 20_000 }, DATA_DATE).status).toBe('PARTIAL')
  })

  it('net payable is the invoice less its retention', () => {
    expect(paymentStatus(invoice, DATA_DATE).netPayable).toBeCloseTo(58_900, 6)
  })
})

// ── Bid leveling ──────────────────────────────────────────────────────────

const pkg = (over: Partial<PackageInput> = {}): PackageInput => ({
  id: 'p',
  name: 'Site Utilities',
  tradeName: 'Site Utilities',
  divisionCode: '33',
  budgetAmount: 292_500,
  carriedAmount: 292_500,
  awardedVendorId: null,
  awardAmount: 0,
  status: 'BIDDING',
  notes: null,
  quotes: [],
  ...over,
})

describe('bid leveling: Bid Leveling F,J,N,O,P,T', () => {
  const quotes = [
    { id: 'q1', vendorId: 'v1', vendorName: 'Basalt Site Works', baseAmount: 287_000, adjustmentAmount: 0, inclusions: 'sanitary; storm; water main', exclusions: 'rock excavation', qualifications: null, allowances: 0, status: 'RECEIVED', notes: null },
    { id: 'q2', vendorId: 'v2', vendorName: 'Columbia Underground', baseAmount: 301_400, adjustmentAmount: 0, inclusions: 'sanitary; storm; water main; dewatering', exclusions: null, qualifications: null, allowances: 0, status: 'RECEIVED', notes: null },
  ]

  it('levels each quote and identifies the low bidder', () => {
    const leveled = levelPackage(pkg({ quotes }))
    expect(leveled.quotes[0].leveledAmount).toBe(287_000)
    expect(leveled.quotes[1].leveledAmount).toBe(301_400)
    expect(leveled.lowLeveled).toBe(287_000)
    expect(leveled.quotes[0].isLow).toBe(true)
    expect(leveled.underOverBudget).toBe(5_500)
  })

  it('an adjustment changes which bid actually wins', () => {
    const leveled = levelPackage(
      pkg({ quotes: [{ ...quotes[0], baseAmount: 287_000, adjustmentAmount: 20_000 }, quotes[1]] }),
    )
    expect(leveled.lowLeveled).toBe(301_400)
    expect(leveled.quotes[1].isLow).toBe(true)
  })

  it('a bidder missing a scope another included is flagged', () => {
    const leveled = levelPackage(pkg({ quotes }))
    expect(leveled.quotes[0].missingScopes).toContain('dewatering')
    expect(leveled.quotes[0].flags.some((f) => f.includes('scope gap'))).toBe(true)
  })

  it('a single bidder and a wide spread both raise package flags', () => {
    expect(levelPackage(pkg({ quotes: [quotes[0]] })).flags).toContain('Only one bidder, no competitive check')
    const wide = levelPackage(pkg({ quotes: [quotes[0], { ...quotes[1], baseAmount: 400_000 }] }))
    expect(wide.flags.some((f) => f.startsWith('Wide spread'))).toBe(true)
  })

  it('every bid over budget is called out', () => {
    const overBudget = levelPackage(pkg({ budgetAmount: 200_000, quotes }))
    expect(overBudget.flags).toContain('Every bid is over budget')
    expect(overBudget.quotes[0].flags).toContain('Over budget')
  })

  it('a duplicate bidder in one package is caught', () => {
    const dupe = levelPackage(pkg({ quotes: [quotes[0], { ...quotes[0], id: 'q3' }] }))
    expect(dupe.flags).toContain('Duplicate bidder in this package')
  })

  it('buyout savings equal budget less the award', () => {
    const awarded = levelPackage(pkg({ quotes, awardAmount: 287_000, awardedVendorId: 'v1', status: 'BOUGHT_OUT' }))
    expect(awarded.buyoutSavings).toBe(5_500)
    const summary = levelingSummary([awarded])
    expect(summary.buyoutSavings).toBe(5_500)
    expect(summary.awardedCount).toBe(1)
  })

  it('a package with no quotes reports zero rather than infinity', () => {
    const empty = levelPackage(pkg())
    expect(empty.lowLeveled).toBe(0)
    expect(empty.underOverBudget).toBe(0)
    expect(empty.flags).toContain('No quotes received')
  })
})

// ── Cash flow ─────────────────────────────────────────────────────────────

describe('cash flow S-curve: Progress & Forecast B23:R46', () => {
  const periods: CashFlowPeriodInput[] = [
    { periodEnd: D('2026-01-31'), plannedDeltaPct: 0.09, actualPctComplete: 0.089, actualCost: 215_000, billingOverride: null, collectionOverride: null },
    { periodEnd: D('2026-02-28'), plannedDeltaPct: 0.12, actualPctComplete: 0.208, actualCost: 289_000, billingOverride: null, collectionOverride: null },
    { periodEnd: D('2026-03-31'), plannedDeltaPct: 0.19, actualPctComplete: 0.386, actualCost: 423_854, billingOverride: null, collectionOverride: null },
    { periodEnd: D('2026-04-30'), plannedDeltaPct: 0.12, actualPctComplete: null, actualCost: null, billingOverride: null, collectionOverride: null },
    { periodEnd: D('2026-05-31'), plannedDeltaPct: 0.11, actualPctComplete: null, actualCost: null, billingOverride: null, collectionOverride: null },
  ]

  const ctx = {
    dataDate: DATA_DATE,
    contractStart: D('2026-01-05'),
    forecastCompletion: D('2026-12-04'),
    contractValue: 2_518_000,
    forecastCost: 1_815_420,
    costToDate: 927_854,
    ownerRetentionPct: 0.05,
    billedToDate: 1_046_000,
    collectedToDate: 497_800,
    actualBillingsByMonth: new Map([['2026-01', 225_000], ['2026-02', 299_000], ['2026-03', 522_000]]),
    actualCollectionsByMonth: new Map([['2026-02', 213_750], ['2026-03', 284_050]]),
    collectionLagMonths: 1,
  }

  const rows = buildCashFlow(periods, ctx)

  it('marks months at or before the data date as actual', () => {
    expect(rows.slice(0, 3).every((r) => r.isActual)).toBe(true)
    expect(rows.slice(3).every((r) => !r.isActual)).toBe(true)
  })

  it('actual months use recorded cost, future months use the spread forecast', () => {
    expect(rows[2].actualCost).toBe(423_854)
    expect(rows[2].forecastCost).toBe(0)
    expect(rows[3].actualCost).toBeNull()
    // (1,815,420 − 927,854) × 0.12 ÷ (1 − 0.40)
    expect(rows[3].forecastCost).toBeCloseTo(177_513.2, 4)
    expect(rows[4].forecastCost).toBeCloseTo(162_720.4333333, 4)
  })

  it('cumulative cost through the data date equals cost to date', () => {
    expect(rows[2].cumulativeCost).toBeCloseTo(927_854, 4)
  })

  it('planned cumulative percent accumulates and caps at 100%', () => {
    expect(rows[2].plannedCumPct).toBeCloseTo(0.4, 10)
    const capped = buildCashFlow(
      periods.map((p) => ({ ...p, plannedDeltaPct: 0.5 })),
      ctx,
    )
    expect(capped.at(-1)!.plannedCumPct).toBe(1)
  })

  it('billings in actual months come from the owner billing register', () => {
    expect(rows[0].billings).toBe(225_000)
    expect(rows[2].cumulativeBillings).toBe(1_046_000)
  })

  it('the first forecast month collects the receivable outstanding at the data date', () => {
    // billed 1,046,000 less 5% retention, less 497,800 already collected
    expect(rows[3].cashIn).toBeCloseTo(1_046_000 * 0.95 - 497_800, 4)
  })

  it('later forecast months collect the prior month billing, net of retention', () => {
    expect(rows[4].cashIn).toBeCloseTo(rows[3].billings * 0.95, 4)
  })

  it('collecting sooner and spending less always improves the final cash position', () => {
    const scenarios = buildCashFlowScenarios(periods, ctx)
    const best = scenarios.best.at(-1)!.netCash
    const expected = scenarios.expected.at(-1)!.netCash
    const worst = scenarios.worst.at(-1)!.netCash
    expect(best).toBeGreaterThan(expected)
    expect(expected).toBeGreaterThan(worst)
  })

  it('net cash is cumulative cash less cumulative cost', () => {
    for (const r of rows) expect(r.netCash).toBeCloseTo(r.cumulativeCash - r.cumulativeCost, 6)
  })

  it('over/under billing compares cumulative billings to earned value', () => {
    expect(rows[0].overUnderBilled).toBeCloseTo(225_000 - 2_518_000 * 0.089, 4)
    expect(rows[3].overUnderBilled).toBeNull()
  })

  it('a manual billing override wins over the derived spread', () => {
    const overridden = buildCashFlow(
      periods.map((p, i) => (i === 3 ? { ...p, billingOverride: 400_000 } : p)),
      ctx,
    )
    expect(overridden[3].billings).toBe(400_000)
  })

  it('a fully-planned curve at the data date does not divide by zero', () => {
    const done = buildCashFlow(
      [{ periodEnd: D('2026-03-31'), plannedDeltaPct: 1, actualPctComplete: 1, actualCost: 1_000, billingOverride: null, collectionOverride: null },
       { periodEnd: D('2026-04-30'), plannedDeltaPct: 0, actualPctComplete: null, actualCost: null, billingOverride: null, collectionOverride: null }],
      ctx,
    )
    expect(done.every((r) => Number.isFinite(r.totalCost))).toBe(true)
  })

  it('the default curve spans the job and sums to 100%', () => {
    const curve = defaultCurve(D('2026-01-05'), D('2026-11-20'))
    expect(curve.length).toBe(11)
    expect(curve.reduce((a, p) => a + p.plannedDeltaPct, 0)).toBeCloseTo(1, 10)
  })
})

// ── Health scoring and productivity ───────────────────────────────────────

describe('project health: Project Summary W,X,Y,Z', () => {
  const healthy = {
    contractCompletion: D('2026-11-20'),
    forecastCompletion: D('2026-11-20'),
    forecastMargin: 0.28,
    targetMarginPct: 0.16,
    accountsReceivable: 100_000,
    currentContract: 2_518_000,
    safetyScore: 4.6,
    qualityScore: 4.4,
  }

  it('an on-time, on-margin project scores zero and reads OK', () => {
    const h = computeHealth(healthy)
    expect(h.score).toBe(0)
    expect(h.flag).toBe('OK')
    expect(h.scheduleStatus).toBe('On / Ahead')
    expect(h.budgetHealth).toBe('Healthy')
  })

  it('14 days late reads Behind and scores 2', () => {
    const h = computeHealth({ ...healthy, forecastCompletion: D('2026-12-04') })
    expect(h.daysAheadBehind).toBe(-14)
    expect(h.scheduleStatus).toBe('Behind')
    expect(h.score).toBe(2)
  })

  it('more than 14 days late reads Critical', () => {
    expect(computeHealth({ ...healthy, forecastCompletion: D('2026-12-20') }).scheduleStatus).toBe('Critical')
  })

  it('a losing project reaches HIGH RISK', () => {
    const h = computeHealth({ ...healthy, forecastMargin: -0.05, forecastCompletion: D('2026-12-20') })
    expect(h.budgetHealth).toBe('LOSS')
    expect(h.flag).toBe('HIGH RISK')
  })

  it('a margin under target but positive reads Thin Margin', () => {
    expect(computeHealth({ ...healthy, forecastMargin: 0.1 }).budgetHealth).toBe('Thin Margin')
  })

  it('receivables above a quarter of the contract add to the score', () => {
    expect(computeHealth({ ...healthy, accountsReceivable: 700_000 }).score).toBe(1)
  })
})

describe('quantity productivity: Quantity Tracking H-AB', () => {
  const item = {
    itemId: 'q',
    description: '8" PVC sanitary main',
    uom: 'LF',
    costCode: '02-500',
    budgetQty: 2_840,
    budgetUnitRate: 0.11,
    materialOrderedQty: 3_100,
    entries: [
      { installedQty: 1_180, actualHours: 140, crewDays: 17 },
      { installedQty: 460, actualHours: 56, crewDays: 7 },
    ],
  }

  it('reproduces the workbook row', () => {
    const p = deriveQuantityProgress(item)
    expect(p.installedToDate).toBe(1_640)
    expect(p.pctInstalled).toBeCloseTo(0.577464788732394, 12)
    expect(p.remainingQty).toBe(1_200)
    expect(p.budgetHours).toBeCloseTo(312.4, 6)
    expect(p.earnedHours).toBeCloseTo(180.4, 6)
    expect(p.actualHours).toBe(196)
    expect(p.hoursVariance).toBeCloseTo(-15.6, 6)
    expect(p.actualUnitRate).toBeCloseTo(0.119512195121951, 12)
    expect(p.productivityFactor).toBeCloseTo(0.920408163265306, 12)
    expect(p.forecastHoursAtCompletion).toBeCloseTo(339.414634146341, 10)
    expect(p.forecastHoursVariance).toBeCloseTo(-27.0146341463415, 10)
  })

  it('crew production drives the days remaining', () => {
    const p = deriveQuantityProgress(item)
    expect(p.avgDailyProduction).toBeCloseTo(68.3333333, 6)
    expect(p.daysToComplete).toBe(18)
  })

  it('material overage compares ordered quantity to budget', () => {
    expect(deriveQuantityProgress(item).materialOveragePct).toBeCloseTo(260 / 2_840, 10)
  })

  it('an item with no hours logged does not divide by zero', () => {
    const p = deriveQuantityProgress({ ...item, entries: [{ installedQty: 0, actualHours: 0, crewDays: 0 }] })
    expect(p.productivityFactor).toBe(0)
    expect(p.forecastHoursAtCompletion).toBeCloseTo(312.4, 6)
    expect(p.daysToComplete).toBe(0)
  })
})

describe('month helpers', () => {
  it('endOfMonth lands on the last day in UTC', () => {
    expect(endOfMonth(D('2026-02-10')).toISOString().slice(0, 10)).toBe('2026-02-28')
    expect(endOfMonth(D('2024-02-10')).toISOString().slice(0, 10)).toBe('2024-02-29')
  })

  it('monthEndsBetween is inclusive of both ends', () => {
    const months = monthEndsBetween(D('2026-01-05'), D('2026-03-31'))
    expect(months.map((m) => m.toISOString().slice(0, 10))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
})
