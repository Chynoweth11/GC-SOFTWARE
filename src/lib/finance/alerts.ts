import { num, safeDiv } from './core'
import { daysBetween } from './dates'
import type { Alert, AlertSeverity, ProjectFinancials } from './types'
import type { CommitmentDerived } from './commitments'

export interface AlertContext {
  projectId: string
  projectNumber: string
  projectName: string
  dataDate: Date
  financials: ProjectFinancials
  commitments: CommitmentDerived[]
  /** Latest locked forecast period end, null when the project has never been forecast. */
  lastForecastPeriodEnd: Date | null
  /** Previous period EAC by cost code, for month-over-month movement. */
  previousEacByCostCode: ReadonlyMap<string, number>
  /** Cost codes that carry cost but no commitment. */
  targetMarginPct: number
}

const LARGE_MOVE_PCT = 0.1
const LARGE_MOVE_ABS = 25_000

function alert(
  severity: AlertSeverity,
  category: string,
  title: string,
  detail: string,
  ctx: AlertContext,
  extra: Partial<Alert> = {},
): Alert {
  return {
    id: `${ctx.projectId}:${category}:${title}`,
    severity,
    category,
    title,
    detail,
    projectId: ctx.projectId,
    projectNumber: ctx.projectNumber,
    projectName: ctx.projectName,
    ...extra,
  }
}

/**
 * Every alert the forecasting brief calls for, derived from live data.
 * Nothing here is stored: alerts recompute on every read so they can never
 * be stale relative to the numbers they describe.
 */
export function buildProjectAlerts(ctx: AlertContext): Alert[] {
  const out: Alert[] = []
  const f = ctx.financials
  const href = `/projects/${ctx.projectId}`

  // ── Budget overruns, by line and in total ──────────────────────────────
  const overrunLines = f.lines.filter((l) => l.facVariance < -0.005)
  if (overrunLines.length > 0) {
    const total = overrunLines.reduce((a, l) => a + l.facVariance, 0)
    out.push(
      alert(
        Math.abs(total) > 0.02 * f.currentBudget ? 'CRITICAL' : 'WARNING',
        'Budget',
        `${overrunLines.length} cost code${overrunLines.length === 1 ? '' : 's'} forecast over budget`,
        `Forecast exceeds the current budget by ${formatShort(Math.abs(total))} across ${overrunLines
          .slice(0, 3)
          .map((l) => l.code)
          .join(', ')}${overrunLines.length > 3 ? ` and ${overrunLines.length - 3} more` : ''}.`,
        ctx,
        { href: `${href}/budget`, value: total },
      ),
    )
  }

  // ── Negative remaining balances ────────────────────────────────────────
  const negativeRemaining = f.lines.filter((l) => l.remainingBudget < -0.005)
  if (negativeRemaining.length > 0) {
    out.push(
      alert(
        'CRITICAL',
        'Budget',
        `${negativeRemaining.length} cost code${negativeRemaining.length === 1 ? '' : 's'} with a negative remaining balance`,
        `Cost to date already exceeds the current budget on ${negativeRemaining.map((l) => l.code).slice(0, 4).join(', ')}.`,
        ctx,
        { href: `${href}/budget` },
      ),
    )
  }

  // ── Margin erosion ─────────────────────────────────────────────────────
  if (f.forecastMargin < 0) {
    out.push(
      alert('CRITICAL', 'Margin', 'Project is forecast to lose money', `Forecast profit is ${formatShort(f.forecastProfit)} on a contract of ${formatShort(f.contract.currentContract)}.`, ctx, {
        href,
        value: f.forecastProfit,
      }),
    )
  } else if (f.forecastMargin < num(ctx.targetMarginPct)) {
    out.push(
      alert('WARNING', 'Margin', 'Forecast margin is below target', `Forecast margin of ${(f.forecastMargin * 100).toFixed(1)}% is ${Math.abs(f.marginVsTarget * 100).toFixed(1)} points under the ${(ctx.targetMarginPct * 100).toFixed(0)}% target.`, ctx, {
        href,
        value: f.forecastMargin,
      }),
    )
  }

  // ── Missing or stale forecast ──────────────────────────────────────────
  if (!ctx.lastForecastPeriodEnd) {
    out.push(
      alert('WARNING', 'Forecast', 'No forecast has ever been locked', 'This project has no monthly forecast on record. Lock one to establish a baseline for month-over-month comparison.', ctx, {
        href: `${href}/forecast`,
      }),
    )
  } else {
    const staleDays = daysBetween(ctx.lastForecastPeriodEnd, ctx.dataDate)
    if (staleDays > 45) {
      out.push(
        alert('WARNING', 'Forecast', 'Forecast is out of date', `The last locked forecast period ended ${staleDays} days before the data date.`, ctx, {
          href: `${href}/forecast`,
          value: staleDays,
        }),
      )
    }
  }

  // ── Large month-over-month forecast movement ───────────────────────────
  if (ctx.previousEacByCostCode.size > 0) {
    const movers = f.lines
      .map((l) => {
        const prev = ctx.previousEacByCostCode.get(l.costCodeId)
        if (prev == null || prev === 0) return null
        const delta = l.forecastAtCompletion - prev
        return { line: l, delta, deltaPct: safeDiv(delta, prev) }
      })
      .filter((m): m is NonNullable<typeof m> => m != null)
      .filter((m) => Math.abs(m.deltaPct) > LARGE_MOVE_PCT && Math.abs(m.delta) > LARGE_MOVE_ABS)

    if (movers.length > 0) {
      const worst = movers.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a))
      out.push(
        alert('WARNING', 'Forecast', `${movers.length} large forecast movement${movers.length === 1 ? '' : 's'} this period`, `Largest: ${worst.line.code} moved ${worst.delta > 0 ? 'up' : 'down'} ${formatShort(Math.abs(worst.delta))} (${(worst.deltaPct * 100).toFixed(0)}%). Every movement needs a written explanation.`, ctx, {
          href: `${href}/forecast`,
          value: worst.delta,
        }),
      )
    }

    const deteriorated = f.lines.filter((l) => {
      const prev = ctx.previousEacByCostCode.get(l.costCodeId)
      return prev != null && prev > 0 && l.forecastAtCompletion > prev
    })
    const deterioration = deteriorated.reduce(
      (acc, l) => acc + (l.forecastAtCompletion - (ctx.previousEacByCostCode.get(l.costCodeId) ?? 0)),
      0,
    )
    if (deterioration > LARGE_MOVE_ABS) {
      out.push(
        alert('WARNING', 'Forecast', 'Forecast deteriorated against last month', `Total forecast cost rose ${formatShort(deterioration)} across ${deteriorated.length} cost codes.`, ctx, {
          href: `${href}/forecast`,
          value: deterioration,
        }),
      )
    }
  }

  // ── Costs without commitments ──────────────────────────────────────────
  const uncommitted = f.lines.filter(
    (l) =>
      (l.category === 'SUBCONTRACT' || l.category === 'MATERIAL') &&
      l.totalCostToDate > 0 &&
      l.committed <= 0,
  )
  if (uncommitted.length > 0) {
    out.push(
      alert('WARNING', 'Commitments', `${uncommitted.length} cost code${uncommitted.length === 1 ? '' : 's'} carrying cost with no commitment`, `Cost is posting against ${uncommitted.map((l) => l.code).slice(0, 4).join(', ')} with no subcontract or purchase order behind it.`, ctx, {
        href: `${href}/costs`,
      }),
    )
  }

  // ── Commitments exceeding their budget ─────────────────────────────────
  const overCommitted = f.lines.filter((l) => l.committed > l.currentBudget + 0.005 && l.currentBudget > 0)
  if (overCommitted.length > 0) {
    const total = overCommitted.reduce((a, l) => a + (l.committed - l.currentBudget), 0)
    out.push(
      alert('CRITICAL', 'Commitments', `${overCommitted.length} commitment${overCommitted.length === 1 ? '' : 's'} exceed their budget`, `Committed value is ${formatShort(total)} above budget on ${overCommitted.map((l) => l.code).slice(0, 4).join(', ')}.`, ctx, {
        href: `${href}/commitments`,
        value: total,
      }),
    )
  }

  // ── Subcontract overrun risk ───────────────────────────────────────────
  const atRisk = ctx.commitments.filter((c) => c.overrunRisk > 0.005)
  if (atRisk.length > 0) {
    out.push(
      alert('WARNING', 'Commitments', `${atRisk.length} commitment${atRisk.length === 1 ? '' : 's'} forecast to overrun`, `${atRisk.map((c) => c.vendorName).slice(0, 3).join(', ')} forecast above the current committed value.`, ctx, {
        href: `${href}/commitments`,
      }),
    )
  }

  // ── Unusual cost trend: spend outpacing progress ───────────────────────
  const runaway = f.lines.filter(
    (l) => l.currentBudget > 0 && l.pctSpent > l.effectivePctComplete + 0.15 && l.pctSpent > 0.2,
  )
  if (runaway.length > 0) {
    out.push(
      alert('WARNING', 'Cost trend', `${runaway.length} cost code${runaway.length === 1 ? '' : 's'} spending ahead of progress`, `Spend is running more than 15 points ahead of physical progress on ${runaway.map((l) => l.code).slice(0, 4).join(', ')}.`, ctx, {
        href: `${href}/costs`,
      }),
    )
  }

  // ── Billing position ───────────────────────────────────────────────────
  if (f.revenue.underbilled > 0.02 * f.contract.currentContract) {
    out.push(
      alert('WARNING', 'Billing', 'Project is materially underbilled', `${formatShort(f.revenue.underbilled)} of earned revenue has not been billed. Cash is being financed out of the company.`, ctx, {
        href: `${href}/billing`,
        value: f.revenue.underbilled,
      }),
    )
  }
  if (f.billing.accountsReceivable > 0.25 * f.contract.currentContract) {
    out.push(
      alert('CRITICAL', 'Cash', 'Receivables are above a quarter of the contract', `${formatShort(f.billing.accountsReceivable)} outstanding against a contract of ${formatShort(f.contract.currentContract)}.`, ctx, {
        href: `${href}/billing`,
        value: f.billing.accountsReceivable,
      }),
    )
  }

  // ── Change order exposure ──────────────────────────────────────────────
  if (f.contract.pendingChangeOrders > 0.05 * f.contract.currentContract) {
    out.push(
      alert('INFO', 'Change orders', 'Significant pending change-order exposure', `${formatShort(f.contract.pendingChangeOrders)} of change orders are awaiting a decision.`, ctx, {
        href: `${href}/changes`,
        value: f.contract.pendingChangeOrders,
      }),
    )
  }

  return out
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

export function sortAlerts(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

function formatShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}
