import { describe, expect, it } from 'vitest'
import {
  annualizeOverhead,
  deriveAssignment,
  deriveLaborClass,
  summarizeOverhead,
  summarizeProjectLabor,
  unassignedStaffCost,
  type AssignmentInput,
  type LaborClassInput,
} from './labor'
import type { PayrollBurdenRates } from './payroll'

const rates: PayrollBurdenRates = { futaPct: 0.006, ficaPct: 0.0765, sutaPct: 0.02 }

const hourly = (over: Partial<LaborClassInput> = {}): LaborClassInput => ({
  id: 'carp',
  name: 'Carpenter, journey level',
  kind: 'FIELD',
  payBasis: 'HOURLY',
  baseAmount: 40,
  benefitsAmount: 20,
  annualHours: 2080,
  trainingPerHour: 0.5,
  workersCompRate: 1.3,
  workersCompBasis: 'PER_HOUR',
  costCategory: 'LABOR',
  ...over,
})

const salaried = (over: Partial<LaborClassInput> = {}): LaborClassInput => ({
  id: 'pm',
  name: 'Project manager',
  kind: 'STAFF',
  payBasis: 'SALARY',
  baseAmount: 124_800, // 60 an hour over 2080
  benefitsAmount: 20_800, // 10 an hour over 2080
  annualHours: 2080,
  trainingPerHour: 0,
  workersCompRate: 0.5,
  workersCompBasis: 'PER_100_PAYROLL',
  costCategory: 'GENERAL_CONDITIONS',
  ...over,
})

describe('deriveLaborClass: hourly', () => {
  it('builds the same loaded rate as the certified payroll form', () => {
    const row = deriveLaborClass(hourly(), rates)

    expect(row.hourlyWage).toBe(40)
    expect(row.hourlyBenefits).toBe(20)
    expect(row.hourlySubtotal).toBe(60)
    expect(row.futa).toBeCloseTo(0.24, 10)
    expect(row.fica).toBeCloseTo(3.06, 10)
    expect(row.suta).toBeCloseTo(0.8, 10)
    expect(row.training).toBe(0.5)
    expect(row.workersComp).toBe(1.3) // quoted per hour, taken as it stands
    expect(row.loadedHourlyCost).toBeCloseTo(65.9, 10)
  })

  it('charges no percentage burden on the fringe', () => {
    const plain = deriveLaborClass(hourly({ benefitsAmount: 20 }), rates)
    const richer = deriveLaborClass(hourly({ benefitsAmount: 40 }), rates)
    expect(richer.fica).toBe(plain.fica)
    expect(richer.loadedHourlyCost - plain.loadedHourlyCost).toBeCloseTo(20, 10)
  })

  it('converts a workers compensation rate quoted per 100 of payroll', () => {
    const row = deriveLaborClass(hourly({ workersCompRate: 18, workersCompBasis: 'PER_100_PAYROLL' }), rates)
    expect(row.workersComp).toBeCloseTo(7.2, 10) // 18 / 100 x 40
  })

  it('assumes a forty hour week when paid hourly', () => {
    const row = deriveLaborClass(hourly(), rates)
    expect(row.loadedWeeklyCost).toBeCloseTo(65.9 * 40, 8)
  })
})

describe('deriveLaborClass: salaried', () => {
  it('reduces a salary to an hour before loading it', () => {
    const row = deriveLaborClass(salaried(), rates)

    expect(row.hourlyWage).toBeCloseTo(60, 10)
    expect(row.hourlyBenefits).toBeCloseTo(10, 10)
    expect(row.fica).toBeCloseTo(4.59, 10) // 60 x 0.0765
    expect(row.workersComp).toBeCloseTo(0.3, 10) // 0.5 / 100 x 60
    // 70 + 0.36 + 4.59 + 1.20 + 0 + 0.30
    expect(row.loadedHourlyCost).toBeCloseTo(76.45, 10)
  })

  it('spreads the salary over the hours actually worked, not over 2080 by decree', () => {
    // The same salary over 2400 hours is a cheaper hour. Pricing general
    // conditions at the 2080 rate for a superintendent who works 2400 hours
    // overstates the hourly cost by a sixth.
    const at2080 = deriveLaborClass(salaried(), rates)
    const at2400 = deriveLaborClass(salaried({ annualHours: 2400 }), rates)

    expect(at2400.hourlyWage).toBeLessThan(at2080.hourlyWage)
    expect(at2400.hourlyWage).toBeCloseTo(124_800 / 2400, 10)

    // The annual cost of the person barely moves: it is the same salary and the
    // same benefits, with only the burdens shifting slightly.
    expect(at2400.loadedAnnualCost).toBeCloseTo(at2080.loadedAnnualCost, 0)
  })

  it('derives the weekly and annual cost from the hourly one so the three agree', () => {
    const row = deriveLaborClass(salaried(), rates)
    expect(row.loadedWeeklyCost * 52).toBeCloseTo(row.loadedAnnualCost, 6)
    expect(row.loadedMonthlyCost * 12).toBeCloseTo(row.loadedAnnualCost, 6)
  })

  it('says so rather than dividing by zero when the annual hours are missing', () => {
    const row = deriveLaborClass(salaried({ annualHours: 0 }), rates)
    expect(row.hourlyWage).toBe(0)
    expect(row.issues.some((issue) => issue.includes('annual hours'))).toBe(true)
  })

  it('raises a missing state unemployment rate, because it understates the burden', () => {
    const row = deriveLaborClass(salaried(), { ...rates, sutaPct: 0 })
    expect(row.issues.some((issue) => issue.includes('state unemployment rate'))).toBe(true)
  })
})

describe('deriveAssignment', () => {
  const pm = deriveLaborClass(salaried(), rates)
  const carpenter = deriveLaborClass(hourly(), rates)

  const assignment = (over: Partial<AssignmentInput> = {}): AssignmentInput => ({
    id: 'a1',
    classificationId: 'pm',
    label: 'Dan',
    costCodeId: 'cc1',
    basis: 'ALLOCATION',
    budgetedHours: 0,
    allocationPct: 0.5,
    startDate: new Date('2026-03-02T00:00:00.000Z'),
    endDate: new Date('2026-11-27T00:00:00.000Z'),
    loadedRateOverride: null,
    ...over,
  })

  it('costs a share of somebody across a date range', () => {
    const row = deriveAssignment(assignment(), pm)

    // 2 March to 27 November inclusive is 271 days, which is 38.714 weeks.
    expect(row.weeks).toBeCloseTo(271 / 7, 6)
    expect(row.hours).toBeCloseTo((2080 / 52) * (271 / 7) * 0.5, 6)
    expect(row.cost).toBeCloseTo(row.hours * pm.loadedHourlyCost, 6)
    expect(row.displayName).toBe('Dan')
    expect(row.workingOut).toContain('50 percent')
  })

  it('counts both end dates, because both are worked', () => {
    const oneWeek = deriveAssignment(
      assignment({
        startDate: new Date('2026-03-02T00:00:00.000Z'),
        endDate: new Date('2026-03-08T00:00:00.000Z'),
        allocationPct: 1,
      }),
      pm,
    )
    expect(oneWeek.weeks).toBeCloseTo(1, 10)
  })

  it('scales linearly with the allocation', () => {
    const half = deriveAssignment(assignment({ allocationPct: 0.5 }), pm)
    const full = deriveAssignment(assignment({ allocationPct: 1 }), pm)
    expect(full.cost).toBeCloseTo(half.cost * 2, 6)
  })

  it('costs an hours assignment at the loaded rate', () => {
    const row = deriveAssignment(
      assignment({ basis: 'HOURS', budgetedHours: 1200, classificationId: 'carp', label: null }),
      carpenter,
    )
    expect(row.hours).toBe(1200)
    expect(row.cost).toBeCloseTo(1200 * 65.9, 6)
    expect(row.displayName).toBe('Carpenter, journey level')
    expect(row.weeks).toBe(0)
  })

  it('uses a rate negotiated for this job when there is one', () => {
    const row = deriveAssignment(
      assignment({ basis: 'HOURS', budgetedHours: 100, loadedRateOverride: 90 }),
      carpenter,
    )
    expect(row.cost).toBeCloseTo(9_000, 6)
  })

  it('refuses to guess at missing dates or a backwards range', () => {
    expect(deriveAssignment(assignment({ endDate: null }), pm).issues[0]).toContain('start and an end date')
    expect(
      deriveAssignment(
        assignment({
          startDate: new Date('2026-11-27T00:00:00.000Z'),
          endDate: new Date('2026-03-02T00:00:00.000Z'),
        }),
        pm,
      ).issues[0],
    ).toContain('before the start date')
  })

  it('flags an allocation above one whole person', () => {
    const row = deriveAssignment(assignment({ allocationPct: 1.5 }), pm)
    expect(row.issues.some((issue) => issue.includes('above 100 percent'))).toBe(true)
  })
})

describe('summarizeProjectLabor', () => {
  const pm = deriveLaborClass(salaried(), rates)
  const carpenter = deriveLaborClass(hourly(), rates)

  const rows = [
    deriveAssignment(
      {
        id: 'a1',
        classificationId: 'pm',
        label: 'Dan',
        costCodeId: 'cc1',
        basis: 'ALLOCATION',
        budgetedHours: 0,
        allocationPct: 0.5,
        startDate: new Date('2026-03-02T00:00:00.000Z'),
        endDate: new Date('2026-11-27T00:00:00.000Z'),
        loadedRateOverride: null,
      },
      pm,
    ),
    deriveAssignment(
      {
        id: 'a2',
        classificationId: 'carp',
        label: null,
        costCodeId: null,
        basis: 'HOURS',
        budgetedHours: 1200,
        allocationPct: 1,
        startDate: null,
        endDate: null,
        loadedRateOverride: null,
      },
      carpenter,
    ),
  ]

  it('separates field labor from the project team, which budget differently', () => {
    const summary = summarizeProjectLabor(rows)
    const field = summary.byKind.find((group) => group.kind === 'FIELD')
    const staff = summary.byKind.find((group) => group.kind === 'STAFF')

    expect(field?.cost).toBeCloseTo(1200 * 65.9, 6)
    expect(staff?.cost).toBeCloseTo(rows[0].cost, 6)
    expect(summary.totals.cost).toBeCloseTo(rows[0].cost + rows[1].cost, 6)
  })

  it('groups by the cost type each lands in', () => {
    const summary = summarizeProjectLabor(rows)
    expect(summary.byCostCategory.map((group) => group.category).sort()).toEqual([
      'GENERAL_CONDITIONS',
      'LABOR',
    ])
  })

  it('says when an assignment cannot reach a budget line', () => {
    const summary = summarizeProjectLabor(rows)
    expect(summary.issues.some((issue) => issue.includes('no cost code'))).toBe(true)
  })
})

describe('annualizeOverhead', () => {
  it('turns a monthly cost into a year', () => {
    expect(annualizeOverhead({ amount: 4_200, period: 'MONTHLY' })).toBe(50_400)
  })
  it('leaves an annual cost alone', () => {
    expect(annualizeOverhead({ amount: 18_000, period: 'ANNUAL' })).toBe(18_000)
  })
  it('counts a one-time cost against the year it fell in', () => {
    expect(annualizeOverhead({ amount: 32_000, period: 'ONE_TIME' })).toBe(32_000)
  })
})

describe('summarizeOverhead', () => {
  const costs = [
    { id: '1', name: 'Office rent', category: 'OFFICE', amount: 9_500, period: 'MONTHLY' as const },
    { id: '2', name: 'Trucks', category: 'VEHICLES', amount: 6_200, period: 'MONTHLY' as const },
    { id: '3', name: 'Estimating software', category: 'SOFTWARE', amount: 24_000, period: 'ANNUAL' as const },
    { id: '4', name: 'General liability', category: 'INSURANCE', amount: 48_000, period: 'ANNUAL' as const },
  ]

  it('annualizes the list and adds the staff nobody is paying for', () => {
    const summary = summarizeOverhead(costs, {
      annualUnassignedStaff: 340_000,
      annualRevenue: 18_600_000,
      rateOnFile: 0.06,
    })

    // (9500 + 6200) x 12 = 188,400, plus 24,000 and 48,000
    expect(summary.annualNonPayroll).toBeCloseTo(260_400, 6)
    expect(summary.annualOverhead).toBeCloseTo(600_400, 6)
    expect(summary.monthlyOverhead).toBeCloseTo(600_400 / 12, 6)
  })

  it('states the rate the company is really carrying against the one in bids', () => {
    const summary = summarizeOverhead(costs, {
      annualUnassignedStaff: 340_000,
      annualRevenue: 18_600_000,
      rateOnFile: 0.02,
    })

    expect(summary.derivedRate).toBeCloseTo(600_400 / 18_600_000, 10)
    expect(summary.rateGap).toBeCloseTo(summary.derivedRate! - 0.02, 10)
    // The gap only means something as money.
    expect(summary.annualGap).toBeCloseTo(summary.rateGap! * 18_600_000, 6)
    expect(summary.issues.some((issue) => issue.includes('under-recovering'))).toBe(true)
  })

  it('does not invent a rate when there is no revenue to divide by', () => {
    const summary = summarizeOverhead(costs, {
      annualUnassignedStaff: 0,
      annualRevenue: 0,
      rateOnFile: 0.06,
    })
    expect(summary.derivedRate).toBeNull()
    expect(summary.rateGap).toBeNull()
    expect(summary.annualGap).toBeNull()
    expect(summary.issues.some((issue) => issue.includes('No revenue on record'))).toBe(true)
  })

  it('ranks the categories by what they cost', () => {
    const summary = summarizeOverhead(costs, { annualUnassignedStaff: 0, annualRevenue: 1, rateOnFile: 0 })
    expect(summary.byCategory[0].category).toBe('OFFICE') // 114,000
    expect(summary.byCategory[0].share).toBeCloseTo(114_000 / 260_400, 8)
  })

  it('says a rate built with no costs on the list is only the staff figure', () => {
    const summary = summarizeOverhead([], {
      annualUnassignedStaff: 340_000,
      annualRevenue: 10_000_000,
      rateOnFile: 0.06,
    })
    expect(summary.annualOverhead).toBe(340_000)
    expect(summary.issues.some((issue) => issue.includes('No overhead costs listed'))).toBe(true)
  })
})

describe('unassignedStaffCost', () => {
  const pm = deriveLaborClass(salaried(), rates)
  const super_ = deriveLaborClass(salaried({ id: 'super', name: 'Superintendent', baseAmount: 145_600 }), rates)
  const carpenter = deriveLaborClass(hourly(), rates)

  it('counts only the staff share no project is carrying', () => {
    // The manager is half on jobs; the superintendent is not on one at all.
    const result = unassignedStaffCost([pm, super_, carpenter], new Map([['pm', 0.5]]))

    // Field labor is never overhead: it is on a job or it is not employed.
    expect(result.annualStaffCost).toBeCloseTo(pm.loadedAnnualCost + super_.loadedAnnualCost, 6)
    expect(result.annualAssigned).toBeCloseTo(pm.loadedAnnualCost * 0.5, 6)
    expect(result.annualUnassigned).toBeCloseTo(result.annualStaffCost - result.annualAssigned, 6)
    expect(result.utilization).toBeCloseTo(result.annualAssigned / result.annualStaffCost, 10)
  })

  it('names anybody carried entirely by overhead', () => {
    const result = unassignedStaffCost([pm, super_], new Map([['pm', 1]]))
    expect(result.unassigned.map((person) => person.name)).toEqual(['Superintendent'])
    expect(result.unassigned[0].annualCost).toBeCloseTo(super_.loadedAnnualCost, 6)
  })

  it('reports somebody allocated past their own week rather than smoothing it away', () => {
    const result = unassignedStaffCost([pm], new Map([['pm', 1.4]]))
    expect(result.overAllocated).toEqual([{ id: 'pm', name: 'Project manager', share: 1.4 }])
    // Capped before it counts: a job cannot pay for more of somebody than exists.
    expect(result.annualAssigned).toBeCloseTo(pm.loadedAnnualCost, 6)
    expect(result.annualUnassigned).toBe(0)
  })
})
