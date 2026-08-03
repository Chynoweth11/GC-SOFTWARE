import { clampPct, num, safeDiv } from './core'
import { endOfMonth, monthEndsBetween } from './dates'
import type { CashFlowRow, CashFlowScenarios } from './types'

export interface CashFlowPeriodInput {
  periodEnd: Date
  plannedDeltaPct: number
  actualPctComplete: number | null
  actualCost: number | null
  billingOverride: number | null
  collectionOverride: number | null
  notes?: string | null
}

export interface CashFlowContext {
  dataDate: Date
  contractStart: Date
  forecastCompletion: Date
  /** Current contract sum — the revenue the S-curve bills against. */
  contractValue: number
  /** Selected estimate at completion — the cost the S-curve spends. */
  forecastCost: number
  /** Actual cost recognised through the data date. */
  costToDate: number
  ownerRetentionPct: number
  /** Cumulative billed and collected to date, from the owner billing register. */
  billedToDate: number
  collectedToDate: number
  /** Actual billings and collections already recorded, keyed by month. */
  actualBillingsByMonth: ReadonlyMap<string, number>
  actualCollectionsByMonth: ReadonlyMap<string, number>
  /** Days from billing to collection under the expected scenario. */
  collectionLagMonths: number
}

function key(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Builds the monthly cost / billing / cash S-curve.
 *
 * Workbook source: Progress & Forecast ▸ B23:R46. The spreadsheet spread the
 * remaining cost across future months in proportion to the planned progress
 * curve, normalised by the progress still to go:
 *
 *     Forecast Cost(m) = (EAC − AC) × PlannedΔ%(m) ÷ (1 − PlannedCum%(dataDate))
 *
 * That is reproduced exactly. Billings follow the same distribution against the
 * remaining contract, collections lag billings by `collectionLagMonths` net of
 * retention, and retention is released the month after forecast completion.
 */
export function buildCashFlow(
  periods: readonly CashFlowPeriodInput[],
  ctx: CashFlowContext,
): CashFlowRow[] {
  const sorted = [...periods].sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())
  const dataMonthEnd = endOfMonth(ctx.dataDate)

  // Planned cumulative % at each month end, capped at 100%.
  let runningPlanned = 0
  const withPlanned = sorted.map((p) => {
    runningPlanned = Math.min(1, runningPlanned + num(p.plannedDeltaPct))
    return { ...p, plannedCumPct: runningPlanned }
  })

  const plannedCumAtDataDate =
    withPlanned.find((p) => p.periodEnd.getTime() === dataMonthEnd.getTime())?.plannedCumPct ??
    withPlanned.filter((p) => p.periodEnd.getTime() <= dataMonthEnd.getTime()).at(-1)?.plannedCumPct ??
    0

  // Denominator guards against a fully-planned curve at the data date.
  const remainingPlannedShare = Math.max(1 - plannedCumAtDataDate, 0.0001)
  const remainingCost = Math.max(0, num(ctx.forecastCost) - num(ctx.costToDate))
  const remainingContract = Math.max(0, num(ctx.contractValue) - num(ctx.billedToDate))
  const retentionRelease = num(ctx.contractValue) * num(ctx.ownerRetentionPct)
  const retentionMonth = endOfMonth(ctx.forecastCompletion, 1)

  // Receivable already outstanding at the data date. It is collected across the
  // first `lag` forecast months — without this the lag model would re-collect
  // billings the actual months already brought in.
  const openingReceivable = Math.max(
    0,
    num(ctx.billedToDate) * (1 - num(ctx.ownerRetentionPct)) - num(ctx.collectedToDate),
  )
  const lag = Math.max(0, Math.round(ctx.collectionLagMonths))

  const rows: CashFlowRow[] = []
  let cumulativeCost = 0
  let cumulativeBillings = 0
  let cumulativeCash = 0
  let forecastIndex = 0

  for (const period of withPlanned) {
    const isActual = period.periodEnd.getTime() <= dataMonthEnd.getTime()
    const share = num(period.plannedDeltaPct) / remainingPlannedShare

    const actualCost = isActual ? num(period.actualCost) : null
    const forecastCost = isActual ? 0 : Math.max(0, remainingCost * share)
    const totalCost = (actualCost ?? 0) + forecastCost
    cumulativeCost += totalCost

    const actualPctComplete = isActual ? period.actualPctComplete : null
    const earnedValue =
      isActual && actualPctComplete != null ? num(ctx.contractValue) * clampPct(actualPctComplete) : null

    let billings: number
    if (period.billingOverride != null) {
      billings = num(period.billingOverride)
    } else if (isActual) {
      billings = num(ctx.actualBillingsByMonth.get(key(period.periodEnd)))
    } else {
      billings = Math.max(0, remainingContract * share)
    }
    cumulativeBillings += billings

    let cashIn: number
    if (period.collectionOverride != null) {
      cashIn = num(period.collectionOverride)
    } else if (isActual) {
      cashIn = num(ctx.actualCollectionsByMonth.get(key(period.periodEnd)))
    } else {
      // Forecast months collect, in order: the receivable already outstanding at
      // the data date, then each month's own forecast billing `lag` months later,
      // then the retained amount once the job completes.
      if (lag === 0) {
        cashIn = billings * (1 - num(ctx.ownerRetentionPct))
        if (forecastIndex === 0) cashIn += openingReceivable
      } else if (forecastIndex < lag) {
        cashIn = openingReceivable / lag
      } else {
        const source = rows[rows.length - lag]
        cashIn = num(source?.billings) * (1 - num(ctx.ownerRetentionPct))
      }
      if (period.periodEnd.getTime() === retentionMonth.getTime()) cashIn += retentionRelease
      forecastIndex++
    }
    cumulativeCash += cashIn

    const plannedValue = num(ctx.contractValue) * period.plannedCumPct

    rows.push({
      periodEnd: period.periodEnd,
      isActual,
      plannedDeltaPct: num(period.plannedDeltaPct),
      plannedCumPct: period.plannedCumPct,
      plannedValue,
      actualPctComplete,
      earnedValue,
      actualCost,
      forecastCost,
      totalCost,
      cumulativeCost,
      billings,
      cumulativeBillings,
      cashIn,
      cumulativeCash,
      scheduleVariance: earnedValue == null ? null : earnedValue - plannedValue,
      overUnderBilled: earnedValue == null ? null : cumulativeBillings - earnedValue,
      netCash: cumulativeCash - cumulativeCost,
    })
  }

  return rows
}

/**
 * Three scenarios for the same project.
 *   best   — collections arrive a month sooner and remaining cost lands 3% under
 *   worst  — collections lag an extra month and remaining cost runs 8% over
 */
export function buildCashFlowScenarios(
  periods: readonly CashFlowPeriodInput[],
  ctx: CashFlowContext,
): CashFlowScenarios {
  return {
    expected: buildCashFlow(periods, ctx),
    best: buildCashFlow(periods, {
      ...ctx,
      forecastCost: num(ctx.forecastCost) * 0.97,
      collectionLagMonths: Math.max(0, ctx.collectionLagMonths - 1),
    }),
    worst: buildCashFlow(periods, {
      ...ctx,
      forecastCost: num(ctx.forecastCost) * 1.08,
      collectionLagMonths: ctx.collectionLagMonths + 1,
    }),
  }
}

/** Creates an evenly-distributed default curve when a project has no schedule yet. */
export function defaultCurve(start: Date, end: Date): CashFlowPeriodInput[] {
  const months = monthEndsBetween(start, end)
  if (months.length === 0) return []
  // Bell-shaped weighting: construction ramps up, peaks, then tails off.
  const weights = months.map((_, i) => {
    const x = (i + 0.5) / months.length
    return Math.exp(-((x - 0.5) ** 2) / 0.08)
  })
  const total = weights.reduce((a, b) => a + b, 0)
  return months.map((periodEnd, i) => ({
    periodEnd,
    plannedDeltaPct: safeDiv(weights[i], total),
    actualPctComplete: null,
    actualCost: null,
    billingOverride: null,
    collectionOverride: null,
  }))
}

export interface CompanyCashFlowRow {
  periodEnd: Date
  billings: number
  collections: number
  costs: number
  subPayments: number
  netCash: number
  cumulativeCash: number
}

/** Aggregates every project's S-curve into one company cash-flow forecast. */
export function aggregateCashFlow(
  projectCurves: readonly CashFlowRow[][],
  openingCash = 0,
): CompanyCashFlowRow[] {
  const byMonth = new Map<string, { periodEnd: Date; billings: number; collections: number; costs: number }>()

  for (const curve of projectCurves) {
    for (const row of curve) {
      const k = key(row.periodEnd)
      const entry = byMonth.get(k) ?? {
        periodEnd: row.periodEnd,
        billings: 0,
        collections: 0,
        costs: 0,
      }
      entry.billings += row.billings
      entry.collections += row.cashIn
      entry.costs += row.totalCost
      byMonth.set(k, entry)
    }
  }

  let cumulative = openingCash
  return [...byMonth.values()]
    .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())
    .map((entry) => {
      const netCash = entry.collections - entry.costs
      cumulative += netCash
      return {
        periodEnd: entry.periodEnd,
        billings: entry.billings,
        collections: entry.collections,
        costs: entry.costs,
        subPayments: entry.costs,
        netCash,
        cumulativeCash: cumulative,
      }
    })
}
