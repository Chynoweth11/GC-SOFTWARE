import { num, safeDiv, sumBy } from './core'

/**
 * The certified payroll wage rate build-up.
 *
 * Reproduces the seven-step form a public owner asks for on prevailing wage
 * work: the wage and benefit the schedule requires, then each payroll burden
 * stacked on top of the wage, then the fully loaded hourly cost.
 *
 *   SUBTOTAL      = hourly wage + hourly benefits
 *   3 FUTA        = wage x FUTA rate
 *   4 FICA        = wage x FICA rate
 *   5 SUTA        = wage x SUTA rate
 *   6 T&E         = a dollar amount per hour, entered
 *   7 WC          = a dollar amount per hour, entered
 *   TOTAL         = subtotal + 3 + 4 + 5 + 6 + 7
 *
 * Three properties of the form matter and are reproduced exactly.
 *
 * The percentage burdens apply to the wage alone, never to the benefit. A
 * bona fide fringe benefit paid into a plan is not wages, so it does not
 * attract FUTA, FICA or SUTA. Applying them to the subtotal instead is the
 * single most common way one of these sheets comes out wrong, and it inflates
 * every rate on the page.
 *
 * Overtime pays the premium on the wage only. The benefit, and the dollar
 * amounts for training and workers compensation, are per hour worked and do
 * not take the multiplier. The burdens then recompute on the higher wage.
 *
 * Nothing here is rounded until it is displayed. A rate carried to the cent
 * through a hundred hours is a dollar adrift by the end of the week.
 *
 * One simplification is inherited from the form and is deliberate. Federal and
 * state unemployment are only owed on the first few thousand dollars a worker
 * earns in the year, so a crew that has been on the payroll since January stops
 * attracting them long before the job finishes. The form charges them on every
 * hour anyway. That overstates the rate slightly and always in the safe
 * direction, and it is what the owner is shown on the certified form, so it is
 * reproduced rather than corrected. The wage base is recorded on the
 * jurisdiction so the size of the difference can be worked out when it matters.
 */

export interface PayrollBurdenRates {
  /** Federal unemployment, on the wage. */
  futaPct: number
  /** Social security and Medicare, employer share, on the wage. */
  ficaPct: number
  /** State unemployment, on the wage. Varies by employer and by year. */
  sutaPct: number
}

export interface WageRateInput {
  /** Trade and position, as the schedule names it. */
  trade: string
  /** Item 1 on the form. */
  hourlyWage: number
  /** Item 2. Bona fide fringe paid in cash or into a plan. */
  hourlyBenefits: number
  /** Item 6. Training and education, a dollar amount per hour. */
  trainingPerHour?: number | null
  /** Item 7. Workers compensation, a dollar amount per hour. */
  workersCompPerHour?: number | null
  /** 1.5 for time and a half, 2 for double time. */
  overtimeMultiplier?: number | null
}

export interface WageRateDerived {
  trade: string
  hourlyWage: number
  hourlyBenefits: number
  /** Wage plus benefit, before any burden. */
  subtotal: number
  futa: number
  fica: number
  suta: number
  training: number
  workersComp: number
  /** Every burden together, the amount above the subtotal. */
  totalBurden: number
  /** The fully loaded hourly cost. */
  total: number
  /** Burden as a share of the wage, which is how a burden rate is quoted. */
  burdenPctOfWage: number
  /** What the schedule requires, wage plus benefit, for checking against it. */
  prevailingWage: number
  overtimeMultiplier: number
  overtime: OvertimeDerived
}

export interface OvertimeDerived {
  multiplier: number
  /** The wage at the premium. */
  hourlyWage: number
  /** Unchanged: a fringe is paid per hour worked, not at the premium. */
  hourlyBenefits: number
  subtotal: number
  futa: number
  fica: number
  suta: number
  training: number
  workersComp: number
  totalBurden: number
  total: number
}

/** Percentage burdens apply to the wage only, never to the fringe benefit. */
function burdensOnWage(wage: number, rates: PayrollBurdenRates) {
  return {
    futa: wage * num(rates.futaPct),
    fica: wage * num(rates.ficaPct),
    suta: wage * num(rates.sutaPct),
  }
}

export function deriveWageRate(input: WageRateInput, rates: PayrollBurdenRates): WageRateDerived {
  const hourlyWage = num(input.hourlyWage)
  const hourlyBenefits = num(input.hourlyBenefits)
  const training = num(input.trainingPerHour)
  const workersComp = num(input.workersCompPerHour)

  const subtotal = hourlyWage + hourlyBenefits
  const { futa, fica, suta } = burdensOnWage(hourlyWage, rates)
  const totalBurden = futa + fica + suta + training + workersComp
  const total = subtotal + totalBurden

  // A multiplier below 1 would pay less than straight time, which is never what
  // is meant; treat anything unusable as time and a half.
  const raw = num(input.overtimeMultiplier)
  const multiplier = raw >= 1 ? raw : 1.5

  const overtimeWage = hourlyWage * multiplier
  const overtimeBurdens = burdensOnWage(overtimeWage, rates)
  const overtimeSubtotal = overtimeWage + hourlyBenefits
  const overtimeBurden = overtimeBurdens.futa + overtimeBurdens.fica + overtimeBurdens.suta + training + workersComp

  return {
    trade: input.trade,
    hourlyWage,
    hourlyBenefits,
    subtotal,
    futa,
    fica,
    suta,
    training,
    workersComp,
    totalBurden,
    total,
    burdenPctOfWage: safeDiv(totalBurden, hourlyWage),
    prevailingWage: subtotal,
    overtimeMultiplier: multiplier,
    overtime: {
      multiplier,
      hourlyWage: overtimeWage,
      hourlyBenefits,
      subtotal: overtimeSubtotal,
      ...overtimeBurdens,
      training,
      workersComp,
      totalBurden: overtimeBurden,
      total: overtimeSubtotal + overtimeBurden,
    },
  }
}

/**
 * Converts a workers compensation rate into the per-hour figure item 7 wants.
 *
 * Most states quote the premium per 100 dollars of payroll, so it has to be
 * turned into money per hour against the wage before it can go on the sheet. A
 * few states sell the cover through a monopoly fund that quotes cents per hour
 * worked instead, and Washington is one of them; there the published rate is
 * already the answer and multiplying it by the wage would be badly wrong.
 */
export function workersCompPerHour(
  rate: number,
  hourlyWage: number,
  basis: 'PER_HOUR' | 'PER_100_PAYROLL',
): number {
  return basis === 'PER_HOUR' ? num(rate) : (num(rate) / 100) * num(hourlyWage)
}

export interface WageSheetSummary {
  rows: WageRateDerived[]
  /** Straight-time totals across every trade on the sheet. */
  totals: {
    hourlyWage: number
    hourlyBenefits: number
    subtotal: number
    futa: number
    fica: number
    suta: number
    training: number
    workersComp: number
    totalBurden: number
    total: number
  }
  /** Averages, which is what a bid carries when the crew mix is not yet known. */
  averages: {
    hourlyWage: number
    total: number
    burdenPctOfWage: number
  }
  /** Anything a reviewer should look at before the sheet is submitted. */
  issues: string[]
}

export function summarizeWageSheet(
  inputs: readonly WageRateInput[],
  rates: PayrollBurdenRates,
  context: { jurisdictionVerified?: boolean; rateScheduleDate?: Date | null } = {},
): WageSheetSummary {
  const rows = inputs.map((input) => deriveWageRate(input, rates))

  const totals = {
    hourlyWage: sumBy(rows, (r) => r.hourlyWage),
    hourlyBenefits: sumBy(rows, (r) => r.hourlyBenefits),
    subtotal: sumBy(rows, (r) => r.subtotal),
    futa: sumBy(rows, (r) => r.futa),
    fica: sumBy(rows, (r) => r.fica),
    suta: sumBy(rows, (r) => r.suta),
    training: sumBy(rows, (r) => r.training),
    workersComp: sumBy(rows, (r) => r.workersComp),
    totalBurden: sumBy(rows, (r) => r.totalBurden),
    total: sumBy(rows, (r) => r.total),
  }

  const count = rows.length || 1

  const issues: string[] = []
  if (rows.length === 0) issues.push('No trades on this sheet yet.')
  if (!context.rateScheduleDate) {
    issues.push('No rate schedule date. Record the date of the determination or union agreement this sheet is built from.')
  }
  if (context.jurisdictionVerified === false) {
    issues.push('The state unemployment rate has not been verified. It varies by employer and by year.')
  }

  const missingWage = rows.filter((r) => r.hourlyWage <= 0)
  if (missingWage.length > 0) {
    issues.push(`${missingWage.length} ${missingWage.length === 1 ? 'trade has' : 'trades have'} no hourly wage.`)
  }
  const missingComp = rows.filter((r) => r.workersComp <= 0)
  if (missingComp.length > 0) {
    issues.push(
      `${missingComp.length} ${missingComp.length === 1 ? 'trade has' : 'trades have'} no workers compensation rate. It is specific to the classification and the firm.`,
    )
  }
  const noBenefit = rows.filter((r) => r.hourlyWage > 0 && r.hourlyBenefits <= 0)
  if (noBenefit.length > 0) {
    issues.push(
      `${noBenefit.length} ${noBenefit.length === 1 ? 'trade carries' : 'trades carry'} no fringe benefit. On prevailing wage work the fringe is normally paid in cash or into a plan.`,
    )
  }

  return {
    rows,
    totals,
    averages: {
      hourlyWage: totals.hourlyWage / count,
      total: totals.total / count,
      burdenPctOfWage: safeDiv(totals.totalBurden, totals.hourlyWage),
    },
    issues,
  }
}

/**
 * Checks a sheet row against the published determination for that trade.
 *
 * The wage and the fringe may be traded off against each other, so what has to
 * hold is that wage plus fringe meets the published total, and that the cash
 * wage alone is not below the published base wage.
 */
export function checkAgainstDetermination(
  row: WageRateDerived,
  published: { baseWage: number; fringe: number },
): { compliant: boolean; shortfall: number; reason: string | null } {
  const publishedTotal = num(published.baseWage) + num(published.fringe)
  const shortfall = publishedTotal - row.subtotal

  if (shortfall > 0.005) {
    return {
      compliant: false,
      shortfall,
      reason: `Wage and fringe together are ${shortfall.toFixed(2)} an hour below the ${publishedTotal.toFixed(2)} the determination requires.`,
    }
  }
  if (num(published.baseWage) - row.hourlyWage > 0.005) {
    return {
      compliant: false,
      shortfall: num(published.baseWage) - row.hourlyWage,
      reason: `The cash wage is below the ${published.baseWage.toFixed(2)} base rate. A fringe cannot make up a shortfall in the base wage.`,
    }
  }
  return { compliant: true, shortfall: 0, reason: null }
}
