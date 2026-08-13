import { describe, expect, it } from 'vitest'
import {
  deriveEquipmentItem,
  deriveEquipmentUse,
  summarizeFleet,
  type EquipmentUseDerived,
  type FleetItemInput,
} from './equipment'

const excavator: FleetItemInput = {
  id: 'exc',
  name: 'Excavator 320',
  category: 'Earthmoving',
  ownership: 'RENTED',
  hourlyRate: 0,
  dailyRate: 1_200,
  weeklyRate: 4_500,
  monthlyRate: 0,
  operatingCostPerHour: 45,
  standbyRatePerHour: 300,
  hoursPerDay: 8,
  daysPerWeek: 5,
  costCategory: 'EQUIPMENT',
  vendorName: 'Plant Hire Co',
  active: true,
}

const dozer: FleetItemInput = {
  ...excavator,
  id: 'doz',
  name: 'Dozer D6',
  ownership: 'OWNED',
  dailyRate: 900,
  weeklyRate: 0,
  operatingCostPerHour: 38,
  standbyRatePerHour: 0,
  vendorName: null,
}

/** A use of a machine on a job, priced through the same engine the tab uses. */
function use(
  item: FleetItemInput,
  projectId: string,
  over: Partial<Parameters<typeof deriveEquipmentUse>[0]> = {},
): EquipmentUseDerived & { projectId: string } {
  const derived = deriveEquipmentUse(
    {
      id: `${item.id}-${projectId}`,
      equipmentItemId: item.id,
      label: null,
      costCodeId: 'cc',
      basis: 'DAILY',
      units: 10,
      operatingHours: 60,
      standbyHours: 0,
      startDate: null,
      endDate: null,
      rateOverride: null,
      ...over,
    },
    deriveEquipmentItem(item),
  )
  return { ...derived, projectId }
}

describe('fleet: one machine across every job', () => {
  it('adds up what a machine cost on all of them', () => {
    const summary = summarizeFleet(
      [excavator],
      [use(excavator, 'job-a'), use(excavator, 'job-b', { units: 5, operatingHours: 30 })],
    )
    const row = summary.rows[0]
    // 10 days plus 5 days at 1,200 is 18,000 of hire; 90 hours run at 45 is
    // 4,050 of fuel and wear.
    expect(row.rentalCost).toBe(18_000)
    expect(row.operatingCost).toBe(4_050)
    expect(row.cost).toBe(22_050)
    expect(row.jobCount).toBe(2)
  })

  it('counts one job once, however many entries it carries', () => {
    const summary = summarizeFleet([excavator], [use(excavator, 'job-a'), use(excavator, 'job-a')])
    expect(summary.rows[0].jobCount).toBe(1)
  })

  it('lists a machine nobody is using, because that is the interesting row', () => {
    const summary = summarizeFleet([excavator, dozer], [use(excavator, 'job-a')])
    const idle = summary.rows.find((row) => row.name === 'Dozer D6')
    expect(idle).toBeDefined()
    expect(idle!.cost).toBe(0)
    expect(idle!.jobCount).toBe(0)
    expect(summary.idleCount).toBe(1)
  })

  it('leads with what is costing the most', () => {
    const summary = summarizeFleet(
      [excavator, dozer],
      [use(excavator, 'job-a', { units: 1, operatingHours: 8 }), use(dozer, 'job-a', { units: 20, operatingHours: 100 })],
    )
    expect(summary.rows[0].name).toBe('Dozer D6')
  })
})

describe('fleet: what the hire bought against what was used', () => {
  it('reads a full day of running as fully used', () => {
    const summary = summarizeFleet([excavator], [use(excavator, 'job-a', { units: 10, operatingHours: 80 })])
    // Ten days at eight hours is eighty hours of hire, all of them run.
    expect(summary.rows[0].hiredHours).toBe(80)
    expect(summary.rows[0].utilization).toBe(1)
  })

  it('shows a machine hired for a fortnight and barely run', () => {
    const summary = summarizeFleet([excavator], [use(excavator, 'job-a', { units: 10, operatingHours: 20 })])
    expect(summary.rows[0].utilization).toBe(0.25)
  })

  it('converts a weekly hire to hours at the same rate the pricing does', () => {
    const summary = summarizeFleet(
      [excavator],
      [use(excavator, 'job-a', { basis: 'WEEKLY', units: 2, operatingHours: 40 })],
    )
    // Two weeks of five eight-hour days is eighty hours.
    expect(summary.rows[0].hiredHours).toBe(80)
    expect(summary.rows[0].utilization).toBe(0.5)
  })
})

describe('fleet: standby, which is the number to act on', () => {
  it('reports it as a share of what the machine cost', () => {
    const summary = summarizeFleet(
      [excavator],
      // Ten days hire at 1,200 is 12,000; ten hours of standby at 300 is 3,000;
      // no running at all. Standby is 3,000 of 15,000.
      [use(excavator, 'job-a', { units: 10, operatingHours: 0, standbyHours: 10 })],
    )
    expect(summary.rows[0].standbyCost).toBe(3_000)
    expect(summary.rows[0].standbyShare).toBeCloseTo(0.2, 10)
  })

  it('flags a machine standing more than a quarter of what it costs', () => {
    const summary = summarizeFleet(
      [excavator],
      [use(excavator, 'job-a', { units: 5, operatingHours: 0, standbyHours: 10 })],
    )
    // 6,000 of hire against 3,000 of standby is a third.
    expect(summary.standbyHeavy).toHaveLength(1)
  })

  it('leaves a machine that is working alone', () => {
    const summary = summarizeFleet([excavator], [use(excavator, 'job-a', { standbyHours: 1 })])
    expect(summary.standbyHeavy).toHaveLength(0)
  })

  it('divides by nothing safely when the fleet has done no work', () => {
    const summary = summarizeFleet([excavator, dozer], [])
    expect(summary.standbyShare).toBe(0)
    expect(summary.utilization).toBe(0)
    expect(summary.totals.cost).toBe(0)
  })
})
