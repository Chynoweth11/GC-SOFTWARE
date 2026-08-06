import { describe, expect, it } from 'vitest'
import {
  checkAgainstDetermination,
  deriveWageRate,
  summarizeWageSheet,
  workersCompPerHour,
  type PayrollBurdenRates,
  type WageRateInput,
} from './payroll'

/**
 * The figures below are worked by hand from the seven-step form so a change in
 * the engine that quietly moves a rate fails here rather than on a certified
 * payroll report.
 */

const rates: PayrollBurdenRates = { futaPct: 0.006, ficaPct: 0.0765, sutaPct: 0.021 }

const trade = (over: Partial<WageRateInput> = {}): WageRateInput => ({
  trade: 'Carpenter, journey level',
  hourlyWage: 50,
  hourlyBenefits: 20,
  trainingPerHour: 0.5,
  workersCompPerHour: 1.25,
  overtimeMultiplier: 1.5,
  ...over,
})

describe('deriveWageRate: the seven steps of the form', () => {
  it('stacks each burden on the wage and totals the sheet', () => {
    const row = deriveWageRate(trade(), rates)

    expect(row.subtotal).toBe(70)
    expect(row.futa).toBeCloseTo(0.3, 10) // 50 x 0.006
    expect(row.fica).toBeCloseTo(3.825, 10) // 50 x 0.0765
    expect(row.suta).toBeCloseTo(1.05, 10) // 50 x 0.021
    expect(row.training).toBe(0.5)
    expect(row.workersComp).toBe(1.25)
    expect(row.totalBurden).toBeCloseTo(6.925, 10)
    expect(row.total).toBeCloseTo(76.925, 10)
  })

  it('never charges a percentage burden on the fringe benefit', () => {
    // The single most common way one of these sheets comes out wrong. Doubling
    // the fringe must leave every percentage burden exactly where it was.
    const plain = deriveWageRate(trade({ hourlyBenefits: 20 }), rates)
    const richer = deriveWageRate(trade({ hourlyBenefits: 40 }), rates)

    expect(richer.futa).toBe(plain.futa)
    expect(richer.fica).toBe(plain.fica)
    expect(richer.suta).toBe(plain.suta)
    // Only the fringe itself moves, dollar for dollar.
    expect(richer.total - plain.total).toBeCloseTo(20, 10)
  })

  it('would produce a different answer if the burdens ran on the subtotal', () => {
    // Guards the distinction rather than just the arithmetic: if someone
    // changes the base to wage plus fringe, this is what it would come to.
    const row = deriveWageRate(trade(), rates)
    const onSubtotal = 70 * (0.006 + 0.0765 + 0.021) + 0.5 + 1.25
    expect(row.totalBurden).not.toBeCloseTo(onSubtotal, 6)
    expect(row.totalBurden).toBeLessThan(onSubtotal)
  })

  it('quotes the burden as a share of the wage, not of the loaded cost', () => {
    const row = deriveWageRate(trade(), rates)
    expect(row.burdenPctOfWage).toBeCloseTo(6.925 / 50, 10)
  })

  it('carries a zero wage without dividing by it', () => {
    const row = deriveWageRate(trade({ hourlyWage: 0, hourlyBenefits: 0 }), rates)
    expect(row.total).toBeCloseTo(1.75, 10) // training and workers comp only
    expect(row.burdenPctOfWage).toBe(0)
  })

  it('treats the optional dollar items as zero when they are not filled in', () => {
    const row = deriveWageRate(
      trade({ trainingPerHour: null, workersCompPerHour: undefined }),
      rates,
    )
    expect(row.training).toBe(0)
    expect(row.workersComp).toBe(0)
    expect(row.totalBurden).toBeCloseTo(5.175, 10)
  })
})

describe('deriveWageRate: overtime', () => {
  it('pays the premium on the wage only and recomputes the burdens on it', () => {
    const { overtime } = deriveWageRate(trade(), rates)

    expect(overtime.hourlyWage).toBe(75)
    expect(overtime.hourlyBenefits).toBe(20) // per hour worked, not at the premium
    expect(overtime.subtotal).toBe(95)
    expect(overtime.futa).toBeCloseTo(0.45, 10) // 75 x 0.006
    expect(overtime.fica).toBeCloseTo(5.7375, 10)
    expect(overtime.suta).toBeCloseTo(1.575, 10)
    expect(overtime.training).toBe(0.5) // dollars per hour, unchanged
    expect(overtime.workersComp).toBe(1.25)
    expect(overtime.total).toBeCloseTo(104.5125, 10)
  })

  it('handles double time', () => {
    const { overtime } = deriveWageRate(trade({ overtimeMultiplier: 2 }), rates)
    expect(overtime.hourlyWage).toBe(100)
    expect(overtime.subtotal).toBe(120)
    expect(overtime.fica).toBeCloseTo(7.65, 10)
  })

  it('falls back to time and a half when the multiplier is missing or unusable', () => {
    for (const multiplier of [null, undefined, 0, 0.5, -1]) {
      const row = deriveWageRate(trade({ overtimeMultiplier: multiplier }), rates)
      expect(row.overtimeMultiplier).toBe(1.5)
      expect(row.overtime.hourlyWage).toBe(75)
    }
  })

  it('leaves straight time alone at a multiplier of one', () => {
    const row = deriveWageRate(trade({ overtimeMultiplier: 1 }), rates)
    expect(row.overtime.total).toBeCloseTo(row.total, 10)
  })
})

describe('workersCompPerHour', () => {
  it('converts a rate quoted per 100 dollars of payroll', () => {
    expect(workersCompPerHour(18.5, 50, 'PER_100_PAYROLL')).toBeCloseTo(9.25, 10)
  })

  it('takes a rate already quoted per hour worked without touching it', () => {
    // Washington sells cover through Labor and Industries in cents per hour, so
    // multiplying by the wage here would overstate the premium fiftyfold.
    expect(workersCompPerHour(1.3244, 50, 'PER_HOUR')).toBe(1.3244)
  })
})

describe('summarizeWageSheet', () => {
  const sheet = [
    trade({ trade: 'Carpenter, journey level', hourlyWage: 50, hourlyBenefits: 20 }),
    trade({ trade: 'Laborer, group 1', hourlyWage: 34, hourlyBenefits: 16, workersCompPerHour: 2.1 }),
  ]

  it('totals every column across the trades', () => {
    const summary = summarizeWageSheet(sheet, rates, {
      jurisdictionVerified: true,
      rateScheduleDate: new Date('2026-03-03T00:00:00.000Z'),
    })

    expect(summary.rows).toHaveLength(2)
    expect(summary.totals.hourlyWage).toBe(84)
    expect(summary.totals.hourlyBenefits).toBe(36)
    expect(summary.totals.subtotal).toBe(120)
    expect(summary.totals.fica).toBeCloseTo(84 * 0.0765, 10)
    expect(summary.totals.workersComp).toBeCloseTo(3.35, 10)
    expect(summary.totals.total).toBeCloseTo(
      summary.rows[0].total + summary.rows[1].total,
      10,
    )
  })

  it('averages the wage and the loaded cost across the trades on the sheet', () => {
    const summary = summarizeWageSheet(sheet, rates, { jurisdictionVerified: true, rateScheduleDate: new Date() })
    expect(summary.averages.hourlyWage).toBe(42)
    expect(summary.averages.burdenPctOfWage).toBeCloseTo(summary.totals.totalBurden / 84, 10)
  })

  it('raises the unverified state unemployment rate, which is the whole point of the note on the form', () => {
    const summary = summarizeWageSheet(sheet, rates, {
      jurisdictionVerified: false,
      rateScheduleDate: new Date('2026-03-03T00:00:00.000Z'),
    })
    expect(summary.issues.some((issue) => issue.includes('state unemployment rate has not been verified'))).toBe(true)
  })

  it('raises a missing rate schedule date', () => {
    const summary = summarizeWageSheet(sheet, rates, { jurisdictionVerified: true })
    expect(summary.issues.some((issue) => issue.includes('No rate schedule date'))).toBe(true)
  })

  it('raises a trade with no wage, no workers compensation or no fringe', () => {
    const summary = summarizeWageSheet(
      [trade({ hourlyWage: 0 }), trade({ trade: 'Painter', workersCompPerHour: 0 }), trade({ trade: 'Glazier', hourlyBenefits: 0 })],
      rates,
      { jurisdictionVerified: true, rateScheduleDate: new Date() },
    )
    expect(summary.issues.some((i) => i.includes('no hourly wage'))).toBe(true)
    expect(summary.issues.some((i) => i.includes('no workers compensation rate'))).toBe(true)
    expect(summary.issues.some((i) => i.includes('no fringe benefit'))).toBe(true)
  })

  it('says so plainly when the sheet is empty rather than showing a page of zeros', () => {
    const summary = summarizeWageSheet([], rates, { jurisdictionVerified: true, rateScheduleDate: new Date() })
    expect(summary.issues).toContain('No trades on this sheet yet.')
    expect(summary.totals.total).toBe(0)
    expect(summary.averages.hourlyWage).toBe(0)
  })
})

describe('checkAgainstDetermination', () => {
  const row = (wage: number, fringe: number) =>
    deriveWageRate(trade({ hourlyWage: wage, hourlyBenefits: fringe }), rates)

  it('passes when wage plus fringe meets the published total', () => {
    const result = checkAgainstDetermination(row(50, 20), { baseWage: 48, fringe: 22 })
    expect(result.compliant).toBe(true)
    expect(result.shortfall).toBe(0)
  })

  it('allows the fringe to be paid in cash above the base wage', () => {
    // 70 an hour all in cash still meets a 48 plus 22 determination.
    const result = checkAgainstDetermination(row(70, 0), { baseWage: 48, fringe: 22 })
    expect(result.compliant).toBe(true)
  })

  it('fails when the two together fall short of the published total', () => {
    const result = checkAgainstDetermination(row(48, 20), { baseWage: 48, fringe: 22 })
    expect(result.compliant).toBe(false)
    expect(result.shortfall).toBeCloseTo(2, 10)
    expect(result.reason).toContain('2.00')
  })

  it('fails when a rich fringe is used to prop up a cash wage below the base rate', () => {
    // 40 plus 35 clears the 70 total, but the cash wage is under the 48 base.
    const result = checkAgainstDetermination(row(40, 35), { baseWage: 48, fringe: 22 })
    expect(result.compliant).toBe(false)
    expect(result.shortfall).toBeCloseTo(8, 10)
    expect(result.reason).toContain('base wage')
  })

  it('does not fail a row for a rounding difference of a fraction of a cent', () => {
    const result = checkAgainstDetermination(row(48, 21.999), { baseWage: 48, fringe: 22 })
    expect(result.compliant).toBe(true)
  })
})
