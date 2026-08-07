import { describe, expect, it } from 'vitest'
import {
  daysOnSite,
  deriveEquipmentItem,
  deriveEquipmentUse,
  hoursPerUnit,
  rateAtBasis,
  summarizeProjectEquipment,
  type EquipmentItemInput,
  type EquipmentUseInput,
} from './equipment'

const D = (s: string) => new Date(`${s}T00:00:00.000Z`)

const item = (over: Partial<EquipmentItemInput> = {}): EquipmentItemInput => ({
  id: 'ex1',
  name: 'Excavator, 30 tonne',
  category: 'Earthmoving',
  ownership: 'OWNED',
  hourlyRate: 0,
  dailyRate: 960,
  weeklyRate: 3_600,
  monthlyRate: 11_500,
  operatingCostPerHour: 42,
  standbyRatePerHour: 25,
  hoursPerDay: 8,
  daysPerWeek: 5,
  costCategory: 'EQUIPMENT',
  ...over,
})

const use = (over: Partial<EquipmentUseInput> = {}): EquipmentUseInput => ({
  id: 'u1',
  equipmentItemId: 'ex1',
  label: null,
  costCodeId: 'cc1',
  basis: 'DAILY',
  units: 10,
  operatingHours: 68,
  standbyHours: 6,
  startDate: D('2026-03-02'),
  endDate: D('2026-03-13'),
  rateOverride: null,
  ...over,
})

describe('rates at each basis', () => {
  it('reads the rate quoted at the basis asked for', () => {
    expect(rateAtBasis(item(), 'DAILY')).toBe(960)
    expect(rateAtBasis(item(), 'WEEKLY')).toBe(3_600)
    expect(rateAtBasis(item(), 'HOURLY')).toBe(0)
  })

  it('turns a basis into hours using the item own working day', () => {
    expect(hoursPerUnit(item(), 'DAILY')).toBe(8)
    expect(hoursPerUnit(item(), 'WEEKLY')).toBe(40)
    expect(hoursPerUnit(item(), 'MONTHLY')).toBe(160)
    // A haul truck on two shifts is not an eight hour day.
    expect(hoursPerUnit(item({ hoursPerDay: 16, daysPerWeek: 6 }), 'WEEKLY')).toBe(96)
  })

  /**
   * The thing a naive model gets wrong. A week is not five days at the daily
   * rate, and the difference is the whole reason hire is quoted this way.
   */
  it('never derives one basis from another when a rate was quoted for it', () => {
    const machine = item()
    expect(rateAtBasis(machine, 'WEEKLY')).toBe(3_600)
    expect(rateAtBasis(machine, 'DAILY') * 5).toBe(4_800)
    expect(rateAtBasis(machine, 'WEEKLY')).not.toBe(rateAtBasis(machine, 'DAILY') * 5)
  })
})

describe('deriveEquipmentItem', () => {
  it('lists every basis a rate was actually entered for', () => {
    expect(deriveEquipmentItem(item()).quotedBases).toEqual(['DAILY', 'WEEKLY', 'MONTHLY'])
    expect(deriveEquipmentItem(item({ hourlyRate: 140 })).quotedBases).toEqual([
      'HOURLY',
      'DAILY',
      'WEEKLY',
      'MONTHLY',
    ])
  })

  it('reaches an hourly figure from the shortest basis that has a rate, and says which', () => {
    const derived = deriveEquipmentItem(item())
    expect(derived.hourlyRateSource).toBe('DAILY')
    expect(derived.effectiveHourlyRate).toBeCloseTo(960 / 8, 10)
    expect(derived.issues.some((issue) => issue.includes('worked out from the daily rate'))).toBe(true)
  })

  it('uses the hourly rate directly where there is one, with nothing to warn about', () => {
    const derived = deriveEquipmentItem(item({ hourlyRate: 140 }))
    expect(derived.hourlyRateSource).toBe('HOURLY')
    expect(derived.effectiveHourlyRate).toBe(140)
    expect(derived.issues.some((issue) => issue.includes('No hourly rate'))).toBe(false)
  })

  it('loads the hour with the fuel and wear, which is what an hour of work costs', () => {
    const derived = deriveEquipmentItem(item())
    expect(derived.loadedHourlyCost).toBeCloseTo(120 + 42, 10)
  })

  it('says so rather than pricing at nothing when no rate has been entered', () => {
    const derived = deriveEquipmentItem(
      item({ hourlyRate: 0, dailyRate: 0, weeklyRate: 0, monthlyRate: 0 }),
    )
    expect(derived.effectiveHourlyRate).toBe(0)
    expect(derived.hourlyRateSource).toBeNull()
    expect(derived.issues.some((issue) => issue.includes('No rate at any basis'))).toBe(true)
  })

  it('flags an owned machine with no operating cost behind it', () => {
    const derived = deriveEquipmentItem(item({ operatingCostPerHour: 0 }))
    expect(derived.issues.some((issue) => issue.includes('no operating cost'))).toBe(true)
  })
})

describe('deriveEquipmentUse', () => {
  const machine = deriveEquipmentItem(item())

  it('splits the hire, the fuel and the standby rather than adding them up front', () => {
    const row = deriveEquipmentUse(use(), machine)

    expect(row.rate).toBe(960)
    expect(row.rateSource).toBe('equipment list')
    expect(row.rentalCost).toBe(9_600) // 10 days at 960
    expect(row.operatingCost).toBe(68 * 42)
    expect(row.standbyCost).toBe(6 * 25)
    expect(row.cost).toBeCloseTo(9_600 + 2_856 + 150, 10)
  })

  /**
   * A machine standing idle in the rain still costs its hire and burns no fuel.
   * A model that charged fuel by the day would invent it.
   */
  it('charges fuel by the hours it ran, not by the hours it was hired', () => {
    const rained = deriveEquipmentUse(use({ operatingHours: 0 }), machine)
    expect(rained.rentalCost).toBe(9_600)
    expect(rained.operatingCost).toBe(0)
  })

  it('prices a week at the weekly rate, not five daily ones', () => {
    const weekly = deriveEquipmentUse(use({ basis: 'WEEKLY', units: 2, operatingHours: 70 }), machine)
    expect(weekly.rentalCost).toBe(7_200)
    expect(weekly.rentalCost).not.toBe(960 * 10)
  })

  it('uses a rate agreed for the job when there is one', () => {
    const row = deriveEquipmentUse(use({ rateOverride: 850 }), machine)
    expect(row.rate).toBe(850)
    expect(row.rateSource).toBe('agreed for this job')
    expect(row.rentalCost).toBe(8_500)
  })

  it('says so rather than costing nothing when the chosen basis has no rate', () => {
    const row = deriveEquipmentUse(use({ basis: 'HOURLY', units: 40 }), machine)
    expect(row.rentalCost).toBe(0)
    expect(row.rateSource).toBe('no rate at this basis')
    expect(row.issues.some((issue) => issue.includes('No hourly rate on the equipment list'))).toBe(true)
  })

  it('flags more operating hours than the hire covers', () => {
    // Ten days of an eight hour machine is eighty hours; a hundred is a slip
    // or an under-recorded hire, and both are worth seeing.
    const row = deriveEquipmentUse(use({ operatingHours: 100 }), machine)
    expect(row.equivalentHours).toBe(80)
    expect(row.issues.some((issue) => issue.includes('against a hire that covers'))).toBe(true)
  })

  it('names the particular machine where the fleet has several', () => {
    expect(deriveEquipmentUse(use({ label: 'EX-04' }), machine).displayName).toBe('EX-04')
    expect(deriveEquipmentUse(use(), machine).displayName).toBe('Excavator, 30 tonne')
  })
})

describe('summarizeProjectEquipment', () => {
  const excavator = deriveEquipmentItem(item())
  const truck = deriveEquipmentItem(
    item({
      id: 'tr1',
      name: 'Haul truck',
      ownership: 'RENTED',
      dailyRate: 640,
      weeklyRate: 2_400,
      operatingCostPerHour: 28,
      standbyRatePerHour: 0,
    }),
  )

  const rows = [
    deriveEquipmentUse(use(), excavator),
    deriveEquipmentUse(
      use({ id: 'u2', equipmentItemId: 'tr1', basis: 'WEEKLY', units: 2, operatingHours: 64, standbyHours: 0, costCodeId: null }),
      truck,
    ),
  ]

  it('totals the three parts apart from one another', () => {
    const summary = summarizeProjectEquipment(rows)
    expect(summary.totals.rentalCost).toBe(9_600 + 4_800)
    expect(summary.totals.operatingCost).toBe(68 * 42 + 64 * 28)
    expect(summary.totals.standbyCost).toBe(150)
    expect(summary.totals.cost).toBeCloseTo(
      summary.totals.rentalCost + summary.totals.operatingCost + summary.totals.standbyCost,
      10,
    )
  })

  it('separates owned plant from hired, which are managed differently', () => {
    const summary = summarizeProjectEquipment(rows)
    expect(summary.byOwnership.map((group) => group.ownership).sort()).toEqual(['OWNED', 'RENTED'])
  })

  it('states standby as a share, which is the number worth watching', () => {
    const summary = summarizeProjectEquipment(rows)
    expect(summary.standbyShare).toBeCloseTo(150 / summary.totals.cost, 10)
  })

  it('says when an entry cannot reach a budget line', () => {
    const summary = summarizeProjectEquipment(rows)
    expect(summary.issues.some((issue) => issue.includes('no cost code'))).toBe(true)
  })

  it('reports nothing rather than dividing by zero on an empty list', () => {
    const summary = summarizeProjectEquipment([])
    expect(summary.totals.cost).toBe(0)
    expect(summary.standbyShare).toBe(0)
  })
})

describe('daysOnSite', () => {
  it('counts both ends, because a machine delivered Monday and collected Friday is billed five days', () => {
    expect(daysOnSite(D('2026-03-02'), D('2026-03-06'))).toBe(5)
  })

  it('is zero when either date is missing or the range is backwards', () => {
    expect(daysOnSite(null, D('2026-03-06'))).toBe(0)
    expect(daysOnSite(D('2026-03-06'), D('2026-03-02'))).toBe(0)
  })
})
