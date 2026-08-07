import { num, safeDiv, sumBy } from './core'
import { daysBetween } from './dates'
import {
  burdenOnWage,
  workersCompPerHour,
  type PayrollBurdenRates,
} from './payroll'
import type { CostCategory } from './types'

/**
 * What people cost, from a wage or a salary through to a figure a bid can carry.
 *
 * Three questions, one chain of arithmetic:
 *
 *   What does an hour of this person cost?   deriveLaborClass
 *   What does their time on this job cost?   deriveAssignment
 *   What does the rest of the company cost?  summarizeOverhead
 *
 * The first is the certified payroll build-up in `payroll.ts`, reused rather
 * than restated: wage, fringe, then unemployment, social security and Medicare
 * on the wage alone, then training and workers compensation as dollars per
 * hour. A salary reaches the same place by being divided into an hour first.
 *
 * Nothing derived here is ever stored. A pay rise entered on a classification
 * reprices every estimate and every project that person is on, because those
 * pages read this and not a copy of last month's answer.
 */

/** Weeks in a year, used to turn an annual figure into a weekly one. */
const WEEKS_PER_YEAR = 52

export type PayBasis = 'HOURLY' | 'SALARY'
export type LaborKind = 'FIELD' | 'STAFF'
export type AssignmentBasis = 'HOURS' | 'ALLOCATION'
export type WorkersCompBasis = 'PER_HOUR' | 'PER_100_PAYROLL'

export interface LaborClassInput {
  id: string
  name: string
  kind: LaborKind
  payBasis: PayBasis
  /** Per hour when paid hourly, per year when salaried. */
  baseAmount: number
  /** Fringe. Per hour when paid hourly, per year when salaried. */
  benefitsAmount: number
  /** Hours a year a salary is spread over. Ignored when paid hourly. */
  annualHours: number
  trainingPerHour: number
  /** Quoted the way the jurisdiction quotes it, see `workersCompBasis`. */
  workersCompRate: number
  workersCompBasis: WorkersCompBasis
  costCategory: CostCategory
}

export interface LaborClassDerived {
  id: string
  name: string
  kind: LaborKind
  payBasis: PayBasis
  costCategory: CostCategory
  /** The cash wage reduced to an hour, whatever the pay basis. */
  hourlyWage: number
  /** The fringe reduced to an hour. */
  hourlyBenefits: number
  /** Wage plus fringe, before burden. */
  hourlySubtotal: number
  futa: number
  fica: number
  suta: number
  training: number
  workersComp: number
  /** Everything above the subtotal. */
  hourlyBurden: number
  /** The number a takeoff line and a project assignment both price from. */
  loadedHourlyCost: number
  loadedWeeklyCost: number
  loadedMonthlyCost: number
  loadedAnnualCost: number
  /** Burden as a share of the wage, which is how a burden rate is quoted. */
  burdenPctOfWage: number
  /** Anything that would make this rate wrong if left alone. */
  issues: string[]
}

/**
 * Reduces one classification to a fully loaded hourly cost.
 *
 * A salary becomes an hour by dividing by the hours a year it is spread over,
 * and that divisor is not 2080 by decree. A superintendent on a salary who
 * works 2400 hours costs less an hour than the same salary over 2080; pricing
 * at the wrong one is a quiet way for general conditions to come out light.
 *
 * From there it is the same build-up as the certified payroll form, which is
 * the point: a salaried person and an hourly person are compared honestly
 * because their rates were built the same way.
 */
export function deriveLaborClass(
  input: LaborClassInput,
  rates: PayrollBurdenRates,
): LaborClassDerived {
  const salaried = input.payBasis === 'SALARY'
  const annualHours = num(input.annualHours)

  const issues: string[] = []
  if (salaried && annualHours <= 0) {
    issues.push('No annual hours. A salary cannot be reduced to an hour without them.')
  }

  const hourlyWage = salaried ? safeDiv(num(input.baseAmount), annualHours) : num(input.baseAmount)
  const hourlyBenefits = salaried
    ? safeDiv(num(input.benefitsAmount), annualHours)
    : num(input.benefitsAmount)

  const hourlySubtotal = hourlyWage + hourlyBenefits

  // Percentage burdens run on the wage, never on the fringe. See payroll.ts.
  const { futa, fica, suta } = burdenOnWage(hourlyWage, rates)
  const training = num(input.trainingPerHour)
  const workersComp = workersCompPerHour(input.workersCompRate, hourlyWage, input.workersCompBasis)

  const hourlyBurden = futa + fica + suta + training + workersComp
  const loadedHourlyCost = hourlySubtotal + hourlyBurden

  // The weekly and annual figures follow from the hourly one, so the three can
  // never disagree. A salaried week is the annual hours spread over the year,
  // which is the only reading that survives a 2400 hour superintendent.
  const hoursPerWeek = salaried ? safeDiv(annualHours, WEEKS_PER_YEAR) : 40
  const loadedWeeklyCost = loadedHourlyCost * hoursPerWeek
  const loadedAnnualCost = loadedHourlyCost * (salaried ? annualHours : hoursPerWeek * WEEKS_PER_YEAR)

  if (num(input.baseAmount) <= 0) issues.push('No wage or salary entered.')
  if (num(input.workersCompRate) <= 0) {
    issues.push('No workers compensation rate. It is specific to the classification and the firm.')
  }
  if (rates.sutaPct <= 0) {
    issues.push('No state unemployment rate behind this classification, so the burden is understated.')
  }

  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    payBasis: input.payBasis,
    costCategory: input.costCategory,
    hourlyWage,
    hourlyBenefits,
    hourlySubtotal,
    futa,
    fica,
    suta,
    training,
    workersComp,
    hourlyBurden,
    loadedHourlyCost,
    loadedWeeklyCost,
    loadedMonthlyCost: loadedAnnualCost / 12,
    loadedAnnualCost,
    burdenPctOfWage: safeDiv(hourlyBurden, hourlyWage),
    issues,
  }
}

export interface AssignmentInput {
  id: string
  classificationId: string
  /** The person, when this is a named person rather than a generic role. */
  label: string | null
  costCodeId: string | null
  basis: AssignmentBasis
  budgetedHours: number
  allocationPct: number
  startDate: Date | null
  endDate: Date | null
  /** A rate agreed for this job alone. Null uses the classification's. */
  loadedRateOverride: number | null
}

export interface AssignmentDerived extends AssignmentInput {
  /** The classification's name, or the person's where one is named. */
  displayName: string
  className: string
  kind: LaborKind
  costCategory: CostCategory
  loadedHourlyCost: number
  /** Weeks the assignment spans. Zero on an hours basis. */
  weeks: number
  /** Hours the assignment comes to, however it was expressed. */
  hours: number
  /** What this assignment costs the job. */
  cost: number
  /** How the cost was arrived at, for the page to show its working. */
  workingOut: string
  issues: string[]
}

/**
 * Costs one person's time on one job.
 *
 * Hours basis is the simple case: hours at the loaded rate.
 *
 * Allocation is the one that matters for a project team. Half a project
 * manager from March to November is not a number of hours anybody has worked
 * out; it is a share of a person across a stretch of the calendar. The weeks
 * come from the dates, the weekly cost comes from the classification, and the
 * share multiplies them. Expressing it any other way means somebody doing that
 * arithmetic by hand every time the schedule moves.
 */
export function deriveAssignment(
  assignment: AssignmentInput,
  classification: LaborClassDerived,
): AssignmentDerived {
  const loadedHourlyCost =
    assignment.loadedRateOverride != null
      ? num(assignment.loadedRateOverride)
      : classification.loadedHourlyCost

  const issues: string[] = []
  let weeks = 0
  let hours = 0
  let cost = 0
  let workingOut = ''

  if (assignment.basis === 'ALLOCATION') {
    const { startDate, endDate } = assignment
    if (!startDate || !endDate) {
      issues.push('An allocation needs a start and an end date before it can be costed.')
    } else if (endDate.getTime() < startDate.getTime()) {
      issues.push('The end date is before the start date.')
    } else {
      // Inclusive of both ends: a Monday to the following Friday is 12 days of
      // coverage, not 11, because both days are worked.
      weeks = (daysBetween(startDate, endDate) + 1) / 7
    }

    const share = num(assignment.allocationPct)
    if (share <= 0) issues.push('The allocation is zero, so this assignment costs nothing.')
    if (share > 1) issues.push('The allocation is above 100 percent of one person.')

    // The weekly cost is the loaded hourly rate times the classification's own
    // hours in a week, so an override rate flows through it too.
    const hoursPerWeek = safeDiv(classification.loadedWeeklyCost, classification.loadedHourlyCost)
    hours = hoursPerWeek * weeks * share
    cost = loadedHourlyCost * hours
    workingOut = `${weeks.toFixed(1)} weeks at ${(share * 100).toFixed(0)} percent of ${classification.name}`
  } else {
    hours = num(assignment.budgetedHours)
    if (hours <= 0) issues.push('No hours budgeted, so this assignment costs nothing.')
    cost = hours * loadedHourlyCost
    workingOut = `${hours.toFixed(1)} hours of ${classification.name}`
  }

  if (loadedHourlyCost <= 0) issues.push('The classification behind this assignment has no rate.')

  return {
    ...assignment,
    displayName: assignment.label ?? classification.name,
    className: classification.name,
    kind: classification.kind,
    costCategory: classification.costCategory,
    loadedHourlyCost,
    weeks,
    hours,
    cost,
    workingOut,
    issues,
  }
}

export interface ProjectLaborSummary {
  rows: AssignmentDerived[]
  totals: { hours: number; cost: number }
  /** Field labor against project team, which are budgeted differently. */
  byKind: { kind: LaborKind; label: string; hours: number; cost: number }[]
  byCostCategory: { category: CostCategory; hours: number; cost: number }[]
  issues: string[]
}

const KIND_LABELS: Record<LaborKind, string> = {
  FIELD: 'Field labor',
  STAFF: 'Project team',
}

/** Everything one job is spending on people, grouped the way it is budgeted. */
export function summarizeProjectLabor(rows: readonly AssignmentDerived[]): ProjectLaborSummary {
  const byKind = (['FIELD', 'STAFF'] as const)
    .map((kind) => {
      const matching = rows.filter((row) => row.kind === kind)
      return {
        kind,
        label: KIND_LABELS[kind],
        hours: sumBy(matching, (row) => row.hours),
        cost: sumBy(matching, (row) => row.cost),
      }
    })
    .filter((group) => group.cost !== 0 || group.hours !== 0)

  const categories = [...new Set(rows.map((row) => row.costCategory))]
  const byCostCategory = categories.map((category) => {
    const matching = rows.filter((row) => row.costCategory === category)
    return {
      category,
      hours: sumBy(matching, (row) => row.hours),
      cost: sumBy(matching, (row) => row.cost),
    }
  })

  const issues = [...new Set(rows.flatMap((row) => row.issues.map((issue) => `${row.displayName}: ${issue}`)))]
  const uncoded = rows.filter((row) => !row.costCodeId)
  if (uncoded.length > 0) {
    issues.push(
      `${uncoded.length} ${uncoded.length === 1 ? 'assignment has' : 'assignments have'} no cost code, so the cost cannot reach a budget line.`,
    )
  }

  return {
    rows: [...rows],
    totals: { hours: sumBy(rows, (row) => row.hours), cost: sumBy(rows, (row) => row.cost) },
    byKind,
    byCostCategory,
    issues,
  }
}

// ── Overhead ──────────────────────────────────────────────────────────────

export type OverheadPeriod = 'MONTHLY' | 'ANNUAL' | 'ONE_TIME'

export interface OverheadCostInput {
  id: string
  name: string
  category: string
  amount: number
  period: OverheadPeriod
}

/**
 * A cost of being in business, reduced to a year.
 *
 * A one-time cost annualizes to itself. That is a decision rather than an
 * accident: a cost incurred once this year is money the year has to recover,
 * and dropping it would understate the rate. It stops counting the year after,
 * because the item is then retired rather than left on the list.
 */
export function annualizeOverhead(cost: Pick<OverheadCostInput, 'amount' | 'period'>): number {
  const amount = num(cost.amount)
  switch (cost.period) {
    case 'MONTHLY':
      return amount * 12
    case 'ANNUAL':
    case 'ONE_TIME':
      return amount
    default:
      return amount
  }
}

export interface OverheadSummary {
  rows: (OverheadCostInput & { annualAmount: number; monthlyAmount: number })[]
  byCategory: { category: string; annualAmount: number; share: number }[]
  /** Rent, trucks, software and the rest. */
  annualNonPayroll: number
  /** Salaried staff time no project is paying for. */
  annualUnassignedStaff: number
  annualOverhead: number
  monthlyOverhead: number
  /** Revenue the overhead has to be recovered out of. */
  annualRevenue: number
  /** What the company is actually carrying, as a fraction. */
  derivedRate: number | null
  /** What is being charged in bids today. */
  rateOnFile: number
  /** Derived less charged. Positive means bids are not recovering it. */
  rateGap: number | null
  /** That gap in money over a year, which is what makes it real. */
  annualGap: number | null
  issues: string[]
}

/**
 * Works out what overhead percentage the company is actually carrying.
 *
 * A bid carries an overhead percentage, and on most jobs that number is a habit
 * rather than a measurement. This divides real annual overhead by real annual
 * revenue and says what the number should be, next to what is being charged.
 * Where the charged rate is lower, the difference is stated in money a year,
 * because a rate gap of nine tenths of a percent means nothing until it is
 * shown as the six figures it is.
 *
 * Salaried staff are counted from the classification list rather than entered
 * here, so a salary is never in the arithmetic twice: the share of each staff
 * member no project is paying for is overhead, and the rest is on the jobs.
 */
export function summarizeOverhead(
  costs: readonly OverheadCostInput[],
  context: {
    annualUnassignedStaff: number
    annualRevenue: number
    rateOnFile: number
  },
): OverheadSummary {
  const rows = costs.map((cost) => {
    const annualAmount = annualizeOverhead(cost)
    return { ...cost, annualAmount, monthlyAmount: annualAmount / 12 }
  })

  const annualNonPayroll = sumBy(rows, (row) => row.annualAmount)
  const annualUnassignedStaff = num(context.annualUnassignedStaff)
  const annualOverhead = annualNonPayroll + annualUnassignedStaff
  const annualRevenue = num(context.annualRevenue)

  const categories = [...new Set(rows.map((row) => row.category))]
  const byCategory = categories
    .map((category) => {
      const annualAmount = sumBy(
        rows.filter((row) => row.category === category),
        (row) => row.annualAmount,
      )
      return { category, annualAmount, share: safeDiv(annualAmount, annualOverhead) }
    })
    .sort((a, b) => b.annualAmount - a.annualAmount)

  const derivedRate = annualRevenue > 0 ? annualOverhead / annualRevenue : null
  const rateOnFile = num(context.rateOnFile)
  const rateGap = derivedRate === null ? null : derivedRate - rateOnFile

  const issues: string[] = []
  if (annualRevenue <= 0) {
    issues.push('No revenue on record for the last twelve months, so a recovery rate cannot be worked out.')
  }
  if (rows.length === 0) {
    issues.push('No overhead costs listed yet. Until they are, the rate below is only the staff time no job is paying for.')
  }
  if (rateGap !== null && rateGap > 0.001) {
    issues.push(
      `Bids are carrying ${(rateOnFile * 100).toFixed(2)} percent against a real ${(derivedRate! * 100).toFixed(2)} percent, so every job is under-recovering overhead.`,
    )
  }

  return {
    rows,
    byCategory,
    annualNonPayroll,
    annualUnassignedStaff,
    annualOverhead,
    monthlyOverhead: annualOverhead / 12,
    annualRevenue,
    derivedRate,
    rateOnFile,
    rateGap,
    annualGap: rateGap === null ? null : rateGap * annualRevenue,
    issues,
  }
}

export interface StaffUtilization {
  /** What the staff list costs a year, everybody on it. */
  annualStaffCost: number
  /** The share of that the jobs are carrying, at today's allocations. */
  annualAssigned: number
  /** The rest, which is overhead. */
  annualUnassigned: number
  /** Assigned over total, which is the number a principal actually asks for. */
  utilization: number
  /** Anyone allocated past their own week, and anyone on nothing. */
  overAllocated: { id: string; name: string; share: number }[]
  unassigned: { id: string; name: string; annualCost: number }[]
}

/**
 * How much of the salaried staff bill the jobs are carrying, and how much is not.
 *
 * Measured on today's allocations rather than over a year of history, because
 * that is the question being asked: of the people on the payroll right now, how
 * many are on work that pays for them? A share above one is a real finding and
 * is reported rather than smoothed away, but it is capped before it counts
 * towards recovery, since a job cannot pay for more of somebody than exists.
 *
 * Only salaried staff appear here. Field labor is on a job or it is not
 * employed, so it is never overhead.
 */
export function unassignedStaffCost(
  classifications: readonly LaborClassDerived[],
  assignedShareByClassification: ReadonlyMap<string, number>,
): StaffUtilization {
  const staff = classifications.filter((person) => person.kind === 'STAFF')

  const annualStaffCost = sumBy(staff, (person) => person.loadedAnnualCost)
  const annualAssigned = sumBy(staff, (person) => {
    const share = Math.min(1, Math.max(0, num(assignedShareByClassification.get(person.id))))
    return share * person.loadedAnnualCost
  })

  return {
    annualStaffCost,
    annualAssigned,
    annualUnassigned: Math.max(0, annualStaffCost - annualAssigned),
    utilization: safeDiv(annualAssigned, annualStaffCost),
    overAllocated: staff
      .filter((person) => num(assignedShareByClassification.get(person.id)) > 1.0001)
      .map((person) => ({
        id: person.id,
        name: person.name,
        share: num(assignedShareByClassification.get(person.id)),
      })),
    unassigned: staff
      .filter((person) => num(assignedShareByClassification.get(person.id)) <= 0)
      .map((person) => ({ id: person.id, name: person.name, annualCost: person.loadedAnnualCost })),
  }
}
