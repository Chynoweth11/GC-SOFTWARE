import { num, safeDiv, sumBy } from './core'
import { daysBetween } from './dates'
import type { CostCategory } from './types'

/**
 * What equipment costs, and what a machine on a job costs that job.
 *
 * Equipment is a cost like labor is a cost, so it is entered once and every
 * estimate line, change order line, time and materials ticket and project
 * budget prices from the same rate. A rate changed on the list moves all of
 * them, because none of them holds a copy.
 *
 * Three things about equipment rates are true on real jobs and are respected
 * here rather than smoothed over.
 *
 * A weekly rate is almost never five daily rates, and a monthly rate is almost
 * never four weekly ones. Rates are therefore held at each basis they are
 * quoted at, and the basis chosen for a job is the one that gets used. Where
 * that basis has no rate, this says so instead of inventing one.
 *
 * A machine standing idle on site still costs its rate and costs no fuel. The
 * operating cost is per hour actually run, kept apart from the rental rate, so
 * a week of rain does not silently bill fuel nobody burned.
 *
 * A day is not eight hours on every job. The conversion factors used to reach
 * an hourly figure are recorded on each item rather than assumed, because a
 * haul truck on two shifts is not an eight hour day.
 */

/** Weeks are turned into months at four, which is how hire is quoted. */
const WEEKS_PER_MONTH = 4

export type EquipmentOwnership = 'OWNED' | 'RENTED' | 'OPERATOR_PROVIDED'
export type RateBasis = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  HOURLY: 'Hourly',
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
}

/** What a unit of each basis is called, for writing out the working. */
export const RATE_BASIS_UNITS: Record<RateBasis, string> = {
  HOURLY: 'hours',
  DAILY: 'days',
  WEEKLY: 'weeks',
  MONTHLY: 'months',
}

export const OWNERSHIP_LABELS: Record<EquipmentOwnership, string> = {
  OWNED: 'Owned',
  RENTED: 'Rented',
  OPERATOR_PROVIDED: 'Operator provided',
}

export interface EquipmentItemInput {
  id: string
  name: string
  category: string | null
  ownership: EquipmentOwnership
  hourlyRate: number
  dailyRate: number
  weeklyRate: number
  monthlyRate: number
  operatingCostPerHour: number
  standbyRatePerHour: number
  hoursPerDay: number
  daysPerWeek: number
  costCategory: CostCategory
}

export interface EquipmentItemDerived extends EquipmentItemInput {
  /** Every basis a rate has actually been entered for. */
  quotedBases: RateBasis[]
  /**
   * One hourly figure, for pricing a line that runs the machine for a number
   * of hours. Taken from the hourly rate where there is one, otherwise
   * converted down from the shortest basis that has one, using this item's own
   * conversion factors.
   */
  effectiveHourlyRate: number
  /** Which basis that figure came from, so the page can say. */
  hourlyRateSource: RateBasis | null
  /** Rate plus fuel and wear, which is what an hour of work really costs. */
  loadedHourlyCost: number
  /** A full day and a full week, for planning a hire. */
  dayCost: number
  weekCost: number
  issues: string[]
}

/** The rate quoted at one basis, or zero where none has been entered. */
export function rateAtBasis(item: Pick<EquipmentItemInput, 'hourlyRate' | 'dailyRate' | 'weeklyRate' | 'monthlyRate'>, basis: RateBasis): number {
  switch (basis) {
    case 'HOURLY':
      return num(item.hourlyRate)
    case 'DAILY':
      return num(item.dailyRate)
    case 'WEEKLY':
      return num(item.weeklyRate)
    case 'MONTHLY':
      return num(item.monthlyRate)
    default:
      return 0
  }
}

/** How many hours one unit of a basis covers, on this item's own working day. */
export function hoursPerUnit(item: Pick<EquipmentItemInput, 'hoursPerDay' | 'daysPerWeek'>, basis: RateBasis): number {
  const hoursPerDay = num(item.hoursPerDay) || 8
  const daysPerWeek = num(item.daysPerWeek) || 5
  switch (basis) {
    case 'HOURLY':
      return 1
    case 'DAILY':
      return hoursPerDay
    case 'WEEKLY':
      return hoursPerDay * daysPerWeek
    case 'MONTHLY':
      return hoursPerDay * daysPerWeek * WEEKS_PER_MONTH
    default:
      return 1
  }
}

export function deriveEquipmentItem(item: EquipmentItemInput): EquipmentItemDerived {
  const bases: RateBasis[] = ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY']
  const quotedBases = bases.filter((basis) => rateAtBasis(item, basis) > 0)

  // The shortest basis with a rate on it, converted down. Shortest first
  // because it is the closest to an hour and so needs the least assuming.
  const source = quotedBases[0] ?? null
  const effectiveHourlyRate = source ? safeDiv(rateAtBasis(item, source), hoursPerUnit(item, source)) : 0

  const issues: string[] = []
  if (quotedBases.length === 0) {
    issues.push('No rate at any basis, so this item prices at nothing.')
  } else if (source !== 'HOURLY') {
    issues.push(
      `No hourly rate. An hour is worked out from the ${RATE_BASIS_LABELS[source!].toLowerCase()} rate over ${hoursPerUnit(item, source!)} hours.`,
    )
  }
  if (item.ownership === 'OWNED' && num(item.operatingCostPerHour) <= 0) {
    issues.push('Owned, with no operating cost. Fuel, wear and maintenance are then charged to nothing.')
  }

  return {
    ...item,
    quotedBases,
    effectiveHourlyRate,
    hourlyRateSource: source,
    loadedHourlyCost: effectiveHourlyRate + num(item.operatingCostPerHour),
    dayCost: rateAtBasis(item, 'DAILY') || effectiveHourlyRate * (num(item.hoursPerDay) || 8),
    weekCost:
      rateAtBasis(item, 'WEEKLY') ||
      (rateAtBasis(item, 'DAILY') || effectiveHourlyRate * (num(item.hoursPerDay) || 8)) * (num(item.daysPerWeek) || 5),
    issues,
  }
}

export interface EquipmentUseInput {
  id: string
  equipmentItemId: string
  label: string | null
  costCodeId: string | null
  basis: RateBasis
  units: number
  operatingHours: number
  standbyHours: number
  startDate: Date | null
  endDate: Date | null
  /** A rate agreed for this job alone, at the chosen basis. */
  rateOverride: number | null
}

export interface EquipmentUseDerived extends EquipmentUseInput {
  displayName: string
  itemName: string
  category: string | null
  ownership: EquipmentOwnership
  costCategory: CostCategory
  /** The rate actually applied, at the chosen basis. */
  rate: number
  rateSource: 'agreed for this job' | 'equipment list' | 'no rate at this basis'
  /** What the hire or the ownership recovery costs. */
  rentalCost: number
  /** Fuel, wear and maintenance for the hours it ran. */
  operatingCost: number
  /** Time on site doing nothing. */
  standbyCost: number
  cost: number
  /** Hours this use amounts to, for comparing a day hire against an hour one. */
  equivalentHours: number
  workingOut: string
  issues: string[]
}

/**
 * Costs one machine on one job.
 *
 * The rate at the chosen basis times the units, plus fuel and wear for the
 * hours it actually ran, plus standby for the hours it stood. Three parts
 * because they answer three different questions, and adding them up front
 * would hide the one that is usually wrong.
 */
export function deriveEquipmentUse(use: EquipmentUseInput, item: EquipmentItemDerived): EquipmentUseDerived {
  const listRate = rateAtBasis(item, use.basis)
  const rate = use.rateOverride != null ? num(use.rateOverride) : listRate
  const rateSource =
    use.rateOverride != null
      ? ('agreed for this job' as const)
      : listRate > 0
        ? ('equipment list' as const)
        : ('no rate at this basis' as const)

  const units = num(use.units)
  const rentalCost = rate * units
  const operatingCost = num(use.operatingHours) * num(item.operatingCostPerHour)
  const standbyCost = num(use.standbyHours) * num(item.standbyRatePerHour)

  const issues: string[] = []
  if (rateSource === 'no rate at this basis') {
    issues.push(
      `No ${RATE_BASIS_LABELS[use.basis].toLowerCase()} rate on the equipment list, so this costs nothing. Enter one, or agree a rate for this job.`,
    )
  }
  if (units <= 0) issues.push('No units recorded, so this costs nothing.')
  if (use.startDate && use.endDate && use.endDate.getTime() < use.startDate.getTime()) {
    issues.push('The end date is before the start date.')
  }
  // A machine that ran more hours than the hire covers is either a data entry
  // slip or an under-recorded hire, and both are worth seeing.
  const equivalentHours = units * hoursPerUnit(item, use.basis)
  if (num(use.operatingHours) > equivalentHours + 0.005 && equivalentHours > 0) {
    issues.push(
      `Recorded ${num(use.operatingHours)} operating hours against a hire that covers ${equivalentHours.toFixed(1)}.`,
    )
  }

  return {
    ...use,
    displayName: use.label ?? item.name,
    itemName: item.name,
    category: item.category,
    ownership: item.ownership,
    costCategory: item.costCategory,
    rate,
    rateSource,
    rentalCost,
    operatingCost,
    standbyCost,
    cost: rentalCost + operatingCost + standbyCost,
    equivalentHours,
    workingOut: `${units} ${RATE_BASIS_UNITS[use.basis]} of ${item.name} at ${rate.toFixed(2)}`,
    issues,
  }
}

export interface ProjectEquipmentSummary {
  rows: EquipmentUseDerived[]
  totals: {
    rentalCost: number
    operatingCost: number
    standbyCost: number
    cost: number
    operatingHours: number
    standbyHours: number
  }
  byOwnership: { ownership: EquipmentOwnership; label: string; cost: number }[]
  byCostCategory: { category: CostCategory; cost: number }[]
  /** Standby as a share of the whole, which is the number worth watching. */
  standbyShare: number
  issues: string[]
}

/** Everything one job is spending on plant, grouped the way it is budgeted. */
export function summarizeProjectEquipment(rows: readonly EquipmentUseDerived[]): ProjectEquipmentSummary {
  const totals = {
    rentalCost: sumBy(rows, (row) => row.rentalCost),
    operatingCost: sumBy(rows, (row) => row.operatingCost),
    standbyCost: sumBy(rows, (row) => row.standbyCost),
    cost: sumBy(rows, (row) => row.cost),
    operatingHours: sumBy(rows, (row) => row.operatingHours),
    standbyHours: sumBy(rows, (row) => row.standbyHours),
  }

  const ownerships: EquipmentOwnership[] = ['OWNED', 'RENTED', 'OPERATOR_PROVIDED']
  const byOwnership = ownerships
    .map((ownership) => ({
      ownership,
      label: OWNERSHIP_LABELS[ownership],
      cost: sumBy(
        rows.filter((row) => row.ownership === ownership),
        (row) => row.cost,
      ),
    }))
    .filter((group) => group.cost !== 0)

  const categories = [...new Set(rows.map((row) => row.costCategory))]
  const byCostCategory = categories.map((category) => ({
    category,
    cost: sumBy(
      rows.filter((row) => row.costCategory === category),
      (row) => row.cost,
    ),
  }))

  const issues = [...new Set(rows.flatMap((row) => row.issues.map((issue) => `${row.displayName}: ${issue}`)))]
  const uncoded = rows.filter((row) => !row.costCodeId)
  if (uncoded.length > 0) {
    issues.push(
      `${uncoded.length} ${uncoded.length === 1 ? 'entry has' : 'entries have'} no cost code, so the cost cannot reach a budget line.`,
    )
  }

  return {
    rows: [...rows],
    totals,
    byOwnership,
    byCostCategory,
    standbyShare: safeDiv(totals.standbyCost, totals.cost),
    issues,
  }
}

/**
 * Days a machine has been on the job, for a hire recorded by dates.
 *
 * Inclusive of both ends, because a machine delivered on Monday and collected
 * on Friday was on the job for five days and is billed for five.
 */
export function daysOnSite(startDate: Date | null, endDate: Date | null): number {
  if (!startDate || !endDate) return 0
  const days = daysBetween(startDate, endDate) + 1
  return days > 0 ? days : 0
}

/**
 * One machine, across every job it is on.
 *
 * The project tab answers "what is this job spending on plant". This answers
 * the questions a company asks about a fleet: which machines are earning, which
 * are standing, and whether a machine hired eleven months a year should have
 * been bought. Both read the same rows, so neither can disagree with the other.
 */
export interface FleetRow {
  itemId: string
  name: string
  category: string | null
  ownership: EquipmentOwnership
  vendorName: string | null
  active: boolean
  /** Hourly cost including fuel and wear, as a priced line reads it. */
  loadedHourlyCost: number
  /** How many jobs are carrying it right now. */
  jobCount: number
  rentalCost: number
  operatingCost: number
  standbyCost: number
  cost: number
  operatingHours: number
  standbyHours: number
  /** Standby as a share of what this machine cost. The number to act on. */
  standbyShare: number
  /**
   * What the hire actually bought, against what was used.
   *
   * A machine hired for eighty hours and run for twenty is not being used; a
   * machine run for more hours than the hire covers is under-recorded. Both are
   * worth seeing next to each other.
   */
  hiredHours: number
  utilization: number
  issues: string[]
}

export interface FleetSummary {
  rows: FleetRow[]
  totals: {
    rentalCost: number
    operatingCost: number
    standbyCost: number
    cost: number
    operatingHours: number
    standbyHours: number
    hiredHours: number
  }
  standbyShare: number
  utilization: number
  /** Machines on the list that no job is carrying. */
  idleCount: number
  /** Machines whose standby is more than a quarter of what they cost. */
  standbyHeavy: FleetRow[]
}

export interface FleetItemInput extends EquipmentItemInput {
  vendorName: string | null
  active: boolean
}

/**
 * Rolls every machine's use up to the machine.
 *
 * A machine with no use at all is still listed, with zeros. A fleet page that
 * hid the idle machines would answer the wrong question: an excavator nobody
 * has charged to a job for four months is the most interesting row on it.
 */
export function summarizeFleet(
  items: readonly FleetItemInput[],
  uses: readonly (EquipmentUseDerived & { projectId: string })[],
): FleetSummary {
  const rows: FleetRow[] = items.map((item) => {
    const derived = deriveEquipmentItem(item)
    const mine = uses.filter((use) => use.equipmentItemId === item.id)

    const rentalCost = sumBy(mine, (use) => use.rentalCost)
    const operatingCost = sumBy(mine, (use) => use.operatingCost)
    const standbyCost = sumBy(mine, (use) => use.standbyCost)
    const cost = rentalCost + operatingCost + standbyCost
    const operatingHours = sumBy(mine, (use) => use.operatingHours)
    const standbyHours = sumBy(mine, (use) => use.standbyHours)

    // What the hire covered: the units booked, converted to hours at the basis
    // each one was hired on.
    const hiredHours = sumBy(mine, (use) => num(use.units) * hoursPerUnit(item, use.basis))

    return {
      itemId: item.id,
      name: item.name,
      category: item.category ?? null,
      ownership: item.ownership,
      vendorName: item.vendorName,
      active: item.active,
      loadedHourlyCost: derived.loadedHourlyCost,
      jobCount: new Set(mine.map((use) => use.projectId)).size,
      rentalCost,
      operatingCost,
      standbyCost,
      cost,
      operatingHours,
      standbyHours,
      standbyShare: safeDiv(standbyCost, cost),
      hiredHours,
      utilization: safeDiv(operatingHours, hiredHours),
      issues: derived.issues,
    }
  })

  rows.sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name))

  const totals = {
    rentalCost: sumBy(rows, (row) => row.rentalCost),
    operatingCost: sumBy(rows, (row) => row.operatingCost),
    standbyCost: sumBy(rows, (row) => row.standbyCost),
    cost: sumBy(rows, (row) => row.cost),
    operatingHours: sumBy(rows, (row) => row.operatingHours),
    standbyHours: sumBy(rows, (row) => row.standbyHours),
    hiredHours: sumBy(rows, (row) => row.hiredHours),
  }

  return {
    rows,
    totals,
    standbyShare: safeDiv(totals.standbyCost, totals.cost),
    utilization: safeDiv(totals.operatingHours, totals.hiredHours),
    idleCount: rows.filter((row) => row.active && row.jobCount === 0).length,
    // A quarter is where standby stops being the cost of doing business and
    // starts being a question about scheduling.
    standbyHeavy: rows.filter((row) => row.cost > 0 && row.standbyShare > 0.25),
  }
}
