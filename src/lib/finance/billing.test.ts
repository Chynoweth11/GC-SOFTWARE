import { describe, expect, it } from 'vitest'
import {
  buildG702,
  computeBillingPosition,
  computePercentComplete,
  computeRevenuePosition,
  type BillingInput,
  type SovLineInput,
} from './billing'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)

/**
 * Job 26-001 billed $225,000 on application 1 and a cumulative $524,000 on
 * application 2, at 5% retainage. Owner Billings ▸ rows 6-7 are the reference.
 */
const sov: SovLineInput[] = [
  { id: 's1', number: '1', description: 'General conditions', scheduledValue: 186_000 },
  { id: 's2', number: '2', description: 'Site utilities', scheduledValue: 292_500 },
  { id: 's3', number: '3', description: 'Balance of work', scheduledValue: 2_039_500 },
]

const apps: BillingInput[] = [
  {
    id: 'a1',
    appNumber: 1,
    periodTo: D('2026-01-31'),
    dateSubmitted: D('2026-01-30'),
    dateApproved: D('2026-02-06'),
    datePaid: D('2026-02-24'),
    retainagePct: 0.05,
    amountPaid: 213_750,
    status: 'PAID',
    lines: [
      { sovLineId: 's1', workThisPeriod: 40_000, storedMaterials: 0 },
      { sovLineId: 's2', workThisPeriod: 120_000, storedMaterials: 0 },
      { sovLineId: 's3', workThisPeriod: 65_000, storedMaterials: 0 },
    ],
  },
  {
    id: 'a2',
    appNumber: 2,
    periodTo: D('2026-02-28'),
    dateSubmitted: D('2026-02-27'),
    dateApproved: D('2026-03-05'),
    datePaid: D('2026-03-23'),
    retainagePct: 0.05,
    amountPaid: 284_050,
    status: 'PAID',
    lines: [
      { sovLineId: 's1', workThisPeriod: 30_000, storedMaterials: 0 },
      { sovLineId: 's2', workThisPeriod: 150_000, storedMaterials: 0 },
      { sovLineId: 's3', workThisPeriod: 119_000, storedMaterials: 0 },
    ],
  },
]

describe('AIA G702: Owner Billings D6:S41', () => {
  const g1 = buildG702(apps[0], apps, sov, 2_450_000, 68_000, D('2026-03-31'))
  const g2 = buildG702(apps[1], apps, sov, 2_450_000, 68_000, D('2026-03-31'))

  it('contract sum to date is original plus approved change orders', () => {
    expect(g1.contractSumToDate).toBe(2_518_000)
  })

  it('application 1 totals, retainage and payment due', () => {
    expect(g1.totalCompletedAndStored).toBe(225_000)
    expect(g1.pctComplete).toBeCloseTo(0.0893566322478157, 12)
    expect(g1.retainage).toBeCloseTo(11_250, 6)
    expect(g1.totalEarnedLessRetainage).toBeCloseTo(213_750, 6)
    expect(g1.lessPreviousCertificates).toBe(0)
    expect(g1.currentPaymentDue).toBeCloseTo(213_750, 6)
    expect(g1.balanceToFinishIncludingRetainage).toBeCloseTo(2_304_250, 6)
  })

  it('application 2 carries application 1 forward as previous certificates', () => {
    expect(g2.totalCompletedAndStored).toBe(524_000)
    expect(g2.pctComplete).toBeCloseTo(0.208101667990469, 12)
    expect(g2.retainage).toBeCloseTo(26_200, 6)
    expect(g2.totalEarnedLessRetainage).toBeCloseTo(497_800, 6)
    expect(g2.lessPreviousCertificates).toBeCloseTo(213_750, 6)
    expect(g2.currentPaymentDue).toBeCloseTo(284_050, 6)
    expect(g2.balanceToFinishIncludingRetainage).toBeCloseTo(2_020_200, 6)
  })

  it('line-level cumulative values roll forward correctly', () => {
    const utilities = g2.lines.find((l) => l.sovLineId === 's2')!
    expect(utilities.fromPreviousApplication).toBe(120_000)
    expect(utilities.workThisPeriod).toBe(150_000)
    expect(utilities.totalCompletedAndStored).toBe(270_000)
    expect(utilities.balanceToFinish).toBe(22_500)
    expect(utilities.pctComplete).toBeCloseTo(270_000 / 292_500, 12)
  })

  it('AR clears once the application is paid in full', () => {
    expect(g1.arOutstanding).toBeCloseTo(0, 6)
    expect(g2.arOutstanding).toBeCloseTo(0, 6)
  })

  it('days outstanding measures submission to payment', () => {
    expect(g1.daysOutstanding).toBe(25)
    expect(g2.daysOutstanding).toBe(24)
  })

  it('stored materials count toward completed and stored', () => {
    const withStored = buildG702(
      { ...apps[0], lines: [{ sovLineId: 's1', workThisPeriod: 10_000, storedMaterials: 5_000 }] },
      [],
      sov,
      1_000_000,
      0,
      D('2026-03-31'),
    )
    expect(withStored.totalCompletedAndStored).toBe(15_000)
  })
})

describe('billing position', () => {
  it('billed to date is the latest cumulative, not a sum of applications', () => {
    const position = computeBillingPosition(apps, sov, 2_450_000, 68_000, D('2026-03-31'))
    expect(position.totalCompletedAndStored).toBe(524_000)
    expect(position.amountCollected).toBeCloseTo(497_800, 6)
    expect(position.lastAppNumber).toBe(2)
    expect(position.remainingContractBalance).toBeCloseTo(1_994_000, 6)
  })

  it('an unpaid application shows as receivable', () => {
    const unpaid: BillingInput[] = [{ ...apps[0], amountPaid: 0, datePaid: null, status: 'SUBMITTED' }]
    const position = computeBillingPosition(unpaid, sov, 2_450_000, 0, D('2026-03-31'))
    expect(position.accountsReceivable).toBeCloseTo(213_750, 6)
    expect(position.amountCollected).toBe(0)
  })

  it('a project with no applications reports a clean zero position', () => {
    const position = computeBillingPosition([], sov, 2_450_000, 68_000, D('2026-03-31'))
    expect(position.totalCompletedAndStored).toBe(0)
    expect(position.remainingContractBalance).toBe(2_518_000)
    expect(position.lastAppNumber).toBe(0)
  })
})

describe('percentage of completion methods', () => {
  const inputs = {
    costToDate: 927_854,
    forecastCost: 1_815_420,
    quantityPctComplete: 0.55,
    subcontractorPctComplete: 0.48,
    schedulePctComplete: 0.6,
    manualPctComplete: 0.52,
    earnedValue: 912_134,
    budgetAtCompletion: 1_799_700,
    amountBilled: 1_046_000,
    contractValue: 2_518_000,
  }

  it('cost-to-cost is cost incurred over forecast final cost', () => {
    expect(computePercentComplete({ ...inputs, method: 'COST_TO_COST' })).toBeCloseTo(0.511096054907, 10)
  })

  it('each alternate method reads its own measure', () => {
    expect(computePercentComplete({ ...inputs, method: 'QUANTITY' })).toBe(0.55)
    expect(computePercentComplete({ ...inputs, method: 'SUBCONTRACTOR_PROGRESS' })).toBe(0.48)
    expect(computePercentComplete({ ...inputs, method: 'SCHEDULE' })).toBe(0.6)
    expect(computePercentComplete({ ...inputs, method: 'MANUAL' })).toBe(0.52)
    expect(computePercentComplete({ ...inputs, method: 'EARNED_VALUE' })).toBeCloseTo(0.506825582041, 10)
    expect(computePercentComplete({ ...inputs, method: 'BILLING' })).toBeCloseTo(0.415409054805, 10)
  })

  it('percent complete is clamped to 0–1 however it is measured', () => {
    expect(computePercentComplete({ ...inputs, method: 'MANUAL', manualPctComplete: 1.4 })).toBe(1)
    expect(computePercentComplete({ ...inputs, method: 'MANUAL', manualPctComplete: -0.2 })).toBe(0)
  })

  it('overbilling and underbilling are mutually exclusive', () => {
    const over = computeRevenuePosition({ ...inputs, method: 'COST_TO_COST' })
    expect(over.revenueEarned).toBeCloseTo(2_518_000 * (927_854 / 1_815_420), 6)
    expect(over.overbilled > 0 ? over.underbilled : over.overbilled).toBe(0)

    const under = computeRevenuePosition({ ...inputs, method: 'MANUAL', manualPctComplete: 0.8, amountBilled: 1_046_000 })
    expect(under.underbilled).toBeCloseTo(2_518_000 * 0.8 - 1_046_000, 6)
    expect(under.overbilled).toBe(0)
  })

  it('remaining revenue plus earned revenue equals the contract', () => {
    const r = computeRevenuePosition({ ...inputs, method: 'COST_TO_COST' })
    expect(r.revenueEarned + r.remainingRevenue).toBeCloseTo(2_518_000, 6)
  })
})
