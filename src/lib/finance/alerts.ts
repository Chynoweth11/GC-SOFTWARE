import { num, safeDiv } from './core'
import { daysBetween } from './dates'
import type { Alert, AlertSeverity, CostLine, ProjectFinancials } from './types'
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
  /** Previous period EAC by line, for month-over-month movement. */
  previousEacByCostCode: ReadonlyMap<string, number>
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

/** Names lines the way the user named them, never by the internal identifier. */
function names(lines: readonly CostLine[], limit = 4): string[] {
  return lines.slice(0, limit).map((line) => line.description)
}

function andMore(count: number, shown: number): string {
  return count > shown ? ` and ${count - shown} more` : ''
}

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many
}

/**
 * Every alert the forecasting brief calls for, derived from live data.
 *
 * Nothing here is stored. Alerts recompute on every read, so they can never be
 * stale relative to the numbers they describe. Each one names the records it is
 * about, quantifies what is at stake, and says what to do next.
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
        `${overrunLines.length} ${plural(overrunLines.length, 'line item')} forecast over budget`,
        `Forecast cost exceeds the current budget by ${formatShort(Math.abs(total))} across ${names(overrunLines, 3).join(', ')}${andMore(overrunLines.length, 3)}.`,
        ctx,
        {
          href: `${href}/budget`,
          value: total,
          valueLabel: 'Forecast over budget',
          action: 'Review the budget and either transfer from another line or raise a change order',
          subjects: names(overrunLines),
        },
      ),
    )
  }

  // ── Negative remaining balances ────────────────────────────────────────
  const negativeRemaining = f.lines.filter((l) => l.remainingBudget < -0.005)
  if (negativeRemaining.length > 0) {
    const total = negativeRemaining.reduce((a, l) => a + l.remainingBudget, 0)
    out.push(
      alert(
        'CRITICAL',
        'Budget',
        `${negativeRemaining.length} ${plural(negativeRemaining.length, 'line item has', 'line items have')} spent past the budget`,
        `Cost to date already exceeds the current budget on ${names(negativeRemaining).join(', ')}${andMore(negativeRemaining.length, 4)}.`,
        ctx,
        {
          href: `${href}/budget`,
          value: total,
          valueLabel: 'Spent past budget',
          action: 'Fund the overrun from contingency or another line, and record why',
          subjects: names(negativeRemaining),
        },
      ),
    )
  }

  // ── Margin erosion ─────────────────────────────────────────────────────
  if (f.forecastMargin < 0) {
    out.push(
      alert(
        'CRITICAL',
        'Margin',
        'This project is forecast to lose money',
        `Forecast profit is ${formatShort(f.forecastProfit)} on a contract of ${formatShort(f.contract.currentContract)}.`,
        ctx,
        {
          href,
          value: f.forecastProfit,
          valueLabel: 'Forecast profit',
          action: 'Work the forecast line by line and identify what can be recovered',
        },
      ),
    )
  } else if (f.forecastMargin < num(ctx.targetMarginPct)) {
    out.push(
      alert(
        'WARNING',
        'Margin',
        'Forecast margin is below target',
        `Forecast margin of ${(f.forecastMargin * 100).toFixed(1)} percent is ${Math.abs(f.marginVsTarget * 100).toFixed(1)} points under the ${(ctx.targetMarginPct * 100).toFixed(0)} percent target.`,
        ctx,
        {
          href,
          value: f.forecastProfit,
          valueLabel: 'Forecast profit',
          action: 'Check whether pending change orders or buyout savings close the gap',
        },
      ),
    )
  }

  // ── Missing or stale forecast ──────────────────────────────────────────
  if (!ctx.lastForecastPeriodEnd) {
    out.push(
      alert(
        'WARNING',
        'Forecast',
        'No forecast has ever been locked',
        'This project has no monthly forecast on record, so there is nothing to compare this month against.',
        ctx,
        { href: `${href}/forecast`, action: 'Lock a forecast to establish the baseline' },
      ),
    )
  } else {
    const staleDays = daysBetween(ctx.lastForecastPeriodEnd, ctx.dataDate)
    if (staleDays > 45) {
      out.push(
        alert(
          'WARNING',
          'Forecast',
          'The forecast is out of date',
          `The last locked forecast period ended ${staleDays} days before the data date.`,
          ctx,
          { href: `${href}/forecast`, action: 'Update and lock the current period' },
        ),
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
        alert(
          'WARNING',
          'Forecast',
          `${movers.length} large forecast ${plural(movers.length, 'movement')} this period`,
          `The largest is ${worst.line.description}, which moved ${worst.delta > 0 ? 'up' : 'down'} ${formatShort(Math.abs(worst.delta))}, or ${Math.abs(worst.deltaPct * 100).toFixed(0)} percent.`,
          ctx,
          {
            href: `${href}/forecast`,
            value: worst.delta,
            valueLabel: 'Largest movement',
            action: 'Write an explanation against each movement before locking',
            subjects: movers.slice(0, 4).map((m) => m.line.description),
          },
        ),
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
        alert(
          'WARNING',
          'Forecast',
          'The forecast is worse than last month',
          `Total forecast cost rose ${formatShort(deterioration)} across ${deteriorated.length} ${plural(deteriorated.length, 'line item')}.`,
          ctx,
          {
            href: `${href}/forecast`,
            value: deterioration,
            valueLabel: 'Forecast increase',
            action: 'Find where the increase came from and whether it is recoverable',
            subjects: names(deteriorated),
          },
        ),
      )
    }
  }

  // ── Costs without commitments ──────────────────────────────────────────
  const uncommitted = f.lines.filter(
    (l) => (l.category === 'SUBCONTRACT' || l.category === 'MATERIAL') && l.totalCostToDate > 0 && l.committed <= 0,
  )
  if (uncommitted.length > 0) {
    const exposure = uncommitted.reduce((a, l) => a + l.totalCostToDate, 0)
    out.push(
      alert(
        'WARNING',
        'Commitments',
        `${uncommitted.length} ${plural(uncommitted.length, 'line item is', 'line items are')} carrying cost with no contract behind it`,
        `Cost is posting against ${names(uncommitted).join(', ')}${andMore(uncommitted.length, 4)} with no subcontract or purchase order in place.`,
        ctx,
        {
          href: `${href}/commitments`,
          value: exposure,
          valueLabel: 'Uncommitted spend',
          action: 'Issue the subcontract or purchase order, or recode the cost',
          subjects: names(uncommitted),
        },
      ),
    )
  }

  // ── Commitments exceeding their budget ─────────────────────────────────
  const overCommitted = f.lines.filter((l) => l.committed > l.currentBudget + 0.005 && l.currentBudget > 0)
  if (overCommitted.length > 0) {
    const total = overCommitted.reduce((a, l) => a + (l.committed - l.currentBudget), 0)
    out.push(
      alert(
        'CRITICAL',
        'Commitments',
        `${overCommitted.length} ${plural(overCommitted.length, 'commitment exceeds', 'commitments exceed')} the budget for that work`,
        `Committed value is ${formatShort(total)} above budget on ${names(overCommitted).join(', ')}${andMore(overCommitted.length, 4)}.`,
        ctx,
        {
          href: `${href}/commitments`,
          value: total,
          valueLabel: 'Committed over budget',
          action: 'Move budget onto the line or renegotiate the commitment',
          subjects: names(overCommitted),
        },
      ),
    )
  }

  // ── Subcontract overrun risk ───────────────────────────────────────────
  const atRisk = ctx.commitments.filter((c) => c.overrunRisk > 0.005)
  if (atRisk.length > 0) {
    const total = atRisk.reduce((a, c) => a + c.overrunRisk, 0)
    out.push(
      alert(
        'WARNING',
        'Commitments',
        `${atRisk.length} ${plural(atRisk.length, 'subcontract is', 'subcontracts are')} forecast to overrun`,
        `${atRisk.slice(0, 3).map((c) => c.vendorName).join(', ')}${andMore(atRisk.length, 3)} forecast above the value currently committed.`,
        ctx,
        {
          href: `${href}/commitments`,
          value: total,
          valueLabel: 'Forecast overrun',
          action: 'Price the extra scope as a change to the subcontract',
          subjects: atRisk.slice(0, 4).map((c) => c.vendorName),
        },
      ),
    )
  }

  // ── Unusual cost trend: spend outpacing progress ───────────────────────
  const runaway = f.lines.filter(
    (l) => l.currentBudget > 0 && l.pctSpent > l.effectivePctComplete + 0.15 && l.pctSpent > 0.2,
  )
  if (runaway.length > 0) {
    out.push(
      alert(
        'WARNING',
        'Cost trend',
        `${runaway.length} ${plural(runaway.length, 'line item is', 'line items are')} spending faster than the work is progressing`,
        `Spend is running more than 15 points ahead of physical progress on ${names(runaway).join(', ')}${andMore(runaway.length, 4)}.`,
        ctx,
        {
          href: `${href}/costs`,
          action: 'Check the productivity on those lines and reforecast if the rate is holding',
          subjects: names(runaway),
        },
      ),
    )
  }

  // ── Billing position ───────────────────────────────────────────────────
  if (f.revenue.underbilled > 0.02 * f.contract.currentContract) {
    out.push(
      alert(
        'WARNING',
        'Billing',
        'Work has been earned but not billed',
        `${formatShort(f.revenue.underbilled)} of earned revenue is unbilled, so the company is financing the job.`,
        ctx,
        {
          href: `${href}/billing`,
          value: f.revenue.underbilled,
          valueLabel: 'Earned but unbilled',
          action: 'Raise the next pay application for the work in place',
        },
      ),
    )
  }
  if (f.billing.accountsReceivable > 0.25 * f.contract.currentContract) {
    out.push(
      alert(
        'CRITICAL',
        'Cash',
        'Receivables are above a quarter of the contract',
        `${formatShort(f.billing.accountsReceivable)} is outstanding against a contract of ${formatShort(f.contract.currentContract)}.`,
        ctx,
        {
          href: `${href}/billing`,
          value: f.billing.accountsReceivable,
          valueLabel: 'Outstanding',
          action: 'Chase the open applications before issuing the next one',
        },
      ),
    )
  }

  // ── Change order exposure ──────────────────────────────────────────────
  if (f.contract.pendingChangeOrders > 0.05 * f.contract.currentContract) {
    out.push(
      alert(
        'INFO',
        'Change orders',
        'A significant amount of change-order value is awaiting a decision',
        `${formatShort(f.contract.pendingChangeOrders)} of change orders have been raised but not resolved.`,
        ctx,
        {
          href: `${href}/changes`,
          value: f.contract.pendingChangeOrders,
          valueLabel: 'Awaiting decision',
          action: 'Push the owner for a decision on the oldest ones',
        },
      ),
    )
  }

  return out
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 }

export function sortAlerts(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0) ||
      a.title.localeCompare(b.title),
  )
}

function formatShort(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toFixed(0)}`
}
