import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { computePercentComplete, overallQuantityProgress, safeDiv, sumBy } from '@/lib/finance'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import { money, percent, titleize } from '@/lib/format'
import { DataList, KpiGrid, MoneyKpi, Kpi, Section, Variance, InfoNote } from '@/components/ui'
import { ChartFrame, HorizontalBars, Meter } from '@/components/charts/primitives'
import { setPocMethod } from './actions'

const METHOD_EXPLANATIONS: Record<string, string> = {
  COST_TO_COST: 'Cost incurred ÷ forecast final cost. The default and the most defensible under ASC 606.',
  QUANTITY: 'Earned labour hours ÷ budget hours from quantity tracking, physical progress, not spend.',
  SUBCONTRACTOR_PROGRESS: 'Weighted average of subcontract percent complete, by contract value.',
  SCHEDULE: 'Elapsed time between contract start and forecast completion.',
  MANUAL: "Management's own assessment, entered directly.",
  EARNED_VALUE: 'Earned value ÷ budget at completion.',
  BILLING: 'Amount billed ÷ contract value. The weakest measure, billing can lead or lag the work.',
}

export default async function PocPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, commitments, quantities } = bundle
  const canEdit = can(user.role, 'edit:project_setup')
  const showMargins = can(user.role, 'view:margins')

  const subcontractRows = commitments.filter((c) => c.type === 'SUBCONTRACT')
  const subPct =
    subcontractRows.length > 0
      ? safeDiv(
          sumBy(subcontractRows, (c) => c.currentValue * c.pctComplete),
          sumBy(subcontractRows, (c) => c.currentValue),
        )
      : null
  const quantityPct = overallQuantityProgress(quantities)
  const dataDate = project.dataDate ?? new Date()
  const schedulePct =
    project.contractStart && project.forecastCompletion
      ? Math.max(0, Math.min(1, safeDiv(dataDate.getTime() - project.contractStart.getTime(), project.forecastCompletion.getTime() - project.contractStart.getTime())))
      : null

  const inputs = {
    costToDate: f.totalCostToDate,
    forecastCost: f.forecastCost,
    quantityPctComplete: quantityPct,
    subcontractorPctComplete: subPct,
    schedulePctComplete: schedulePct,
    manualPctComplete: project.manualPctComplete,
    earnedValue: f.earnedValue.earnedValue,
    budgetAtCompletion: f.earnedValue.budgetAtCompletion,
    amountBilled: f.billing.totalCompletedAndStored,
    contractValue: f.contract.currentContract,
  }

  const methods = (['COST_TO_COST', 'QUANTITY', 'SUBCONTRACTOR_PROGRESS', 'SCHEDULE', 'MANUAL', 'EARNED_VALUE', 'BILLING'] as const).map(
    (method) => {
      const pct = computePercentComplete({ ...inputs, method })
      const revenue = f.contract.currentContract * pct
      return {
        method,
        pct,
        revenue,
        overUnder: f.billing.totalCompletedAndStored - revenue,
        available:
          method === 'QUANTITY'
            ? quantityPct != null
            : method === 'SUBCONTRACTOR_PROGRESS'
              ? subPct != null
              : method === 'SCHEDULE'
                ? schedulePct != null
                : method === 'MANUAL'
                  ? project.manualPctComplete != null
                  : true,
      }
    },
  )

  // Trade-level percent complete: cost incurred over forecast, per trade.
  const byTrade = new Map<string, { budget: number; cost: number; forecast: number; earned: number }>()
  for (const line of f.lines) {
    const key = line.tradeName ?? CATEGORY_LABELS[line.category]
    const entry = byTrade.get(key) ?? { budget: 0, cost: 0, forecast: 0, earned: 0 }
    entry.budget += line.currentBudget
    entry.cost += line.totalCostToDate
    entry.forecast += line.forecastAtCompletion
    entry.earned += line.earnedValue
    byTrade.set(key, entry)
  }
  const tradeRows = [...byTrade.entries()]
    .map(([name, v]) => ({
      name,
      ...v,
      pctComplete: safeDiv(v.cost, v.forecast || v.budget),
      revenueShare: safeDiv(v.budget, f.currentBudget) * f.contract.currentContract,
    }))
    .sort((a, b) => b.budget - a.budget)

  return (
    <div className="space-y-6">
      <Section title="Revenue recognition">
        <KpiGrid cols={6}>
          <Kpi
            label="Percent complete"
            value={percent(f.revenue.pctComplete)}
            detail={titleize(f.revenue.method)}
            chart={<Meter value={f.revenue.pctComplete} showLabel={false} />}
          />
          <MoneyKpi label="Contract value" amount={f.contract.currentContract} />
          <MoneyKpi label="Revenue earned" amount={f.revenue.revenueEarned} hint="Contract value × percent complete." />
          <MoneyKpi label="Amount billed" amount={f.revenue.amountBilled} />
          <MoneyKpi
            label={f.revenue.overbilled > 0 ? 'Overbilled' : 'Underbilled'}
            amount={f.revenue.overbilled > 0 ? f.revenue.overbilled : f.revenue.underbilled}
            tone={f.revenue.underbilled > 0 ? 'caution' : 'favorable'}
          />
          <MoneyKpi label="Remaining revenue" amount={f.revenue.remainingRevenue} />
        </KpiGrid>
      </Section>

      <InfoNote>
        Under <strong>{titleize(f.revenue.method)}</strong>, this project has earned {money(f.revenue.revenueEarned)} of its{' '}
        {money(f.contract.currentContract)} contract and billed {money(f.revenue.amountBilled)}.{' '}
        {f.revenue.overbilled > 0 ? `overbilled by ${money(f.revenue.overbilled)}` : `underbilled by ${money(f.revenue.underbilled)}`}.
        {showMargins && ` Profit earned to date is ${money(f.forecastProfit * f.revenue.pctComplete)} of a forecast ${money(f.forecastProfit)}.`}
      </InfoNote>

      <Section
        title="Method comparison"
        description="Every method computed on the same data, so the selection can be argued rather than assumed"
      >
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>What it measures</th>
                  <th className="num">% complete</th>
                  <th style={{ minWidth: 140 }}>Progress</th>
                  <th className="num">Revenue earned</th>
                  <th className="num">Over / (under) billed</th>
                  <th>Selected</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.method} style={m.method === project.pocMethod ? { background: 'var(--accent-soft)' } : undefined}>
                    <td className="font-medium">{titleize(m.method)}</td>
                    <td className="max-w-[24rem]" style={{ color: 'var(--text-muted)' }}>
                      {METHOD_EXPLANATIONS[m.method]}
                    </td>
                    <td className="num">{m.available ? percent(m.pct) : '-'}</td>
                    <td>{m.available ? <Meter value={m.pct} showLabel={false} /> : <span style={{ color: 'var(--text-subtle)' }}>No data</span>}</td>
                    <td className="num">{m.available ? money(m.revenue) : '-'}</td>
                    <td className="num">{m.available ? <Variance value={m.overUnder} favorableWhen="positive" /> : '-'}</td>
                    <td>{m.method === project.pocMethod ? <strong style={{ color: 'var(--accent)' }}>In use</strong> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {canEdit && (
          <form action={setPocMethod} className="card mt-3 flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="min-w-[18rem] flex-1">
              <label htmlFor="poc-method" className="label mb-1.5 block">
                Percentage-of-completion method
              </label>
              <select id="poc-method" name="pocMethod" className="field text-xs" defaultValue={project.pocMethod}>
                {methods.map((m) => (
                  <option key={m.method} value={m.method}>
                    {titleize(m.method)}: {percent(m.pct)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="poc-manual" className="label mb-1.5 block">
                Manual assessment (0–1)
              </label>
              <input
                id="poc-manual"
                name="manualPctComplete"
                type="number"
                step="0.01"
                min="0"
                max="1"
                className="field w-32 text-xs"
                defaultValue={project.manualPctComplete ?? ''}
                placeholder="-"
              />
            </div>
            <button type="submit" className="btn btn-primary">
              Apply method
            </button>
          </form>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Percent complete by trade" subtitle="Cost incurred against each trade's forecast final cost">
          <HorizontalBars
            labels={tradeRows.map((t) => t.name)}
            format="percent"
            series={[{ key: 'pct', label: 'Percent complete', values: tradeRows.map((t) => t.pctComplete) }]}
          />
        </ChartFrame>

        <ChartFrame title="Revenue earned by trade" subtitle="Each trade's share of contract value at its own progress">
          <HorizontalBars
            labels={tradeRows.map((t) => t.name)}
            format="moneyShort"
            series={[
              { key: 'share', label: 'Revenue share', values: tradeRows.map((t) => t.revenueShare) },
              { key: 'earned', label: 'Earned', values: tradeRows.map((t) => t.revenueShare * t.pctComplete), color: 'var(--favorable)' },
            ]}
          />
        </ChartFrame>
      </div>

      <Section title="Trade-level position" description="Percentage of completion computed for each trade independently">
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th className="num">Current budget</th>
                  <th className="num">Actual cost</th>
                  <th className="num">Forecast final cost</th>
                  <th className="num">% complete</th>
                  <th className="num">Revenue share</th>
                  <th className="num">Revenue earned</th>
                  {showMargins && <th className="num">Forecast margin</th>}
                </tr>
              </thead>
              <tbody>
                {tradeRows.map((t) => {
                  const earned = t.revenueShare * t.pctComplete
                  const margin = safeDiv(t.revenueShare - t.forecast, t.revenueShare)
                  return (
                    <tr key={t.name}>
                      <td className="font-medium">{t.name}</td>
                      <td className="num">{money(t.budget)}</td>
                      <td className="num">{money(t.cost)}</td>
                      <td className="num">{money(t.forecast)}</td>
                      <td className="num">{percent(t.pctComplete)}</td>
                      <td className="num">{money(t.revenueShare)}</td>
                      <td className="num">{money(earned)}</td>
                      {showMargins && (
                        <td className="num" style={{ color: margin < 0 ? 'var(--adverse)' : undefined }}>
                          {percent(margin)}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num">{money(f.currentBudget)}</td>
                  <td className="num">{money(f.totalCostToDate)}</td>
                  <td className="num">{money(f.forecastCost)}</td>
                  <td className="num">{percent(f.revenue.pctComplete)}</td>
                  <td className="num">{money(f.contract.currentContract)}</td>
                  <td className="num">{money(f.revenue.revenueEarned)}</td>
                  {showMargins && <td className="num">{percent(f.forecastMargin)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Projected final outcome">
        <div className="card p-4">
          <DataList
            columns={3}
            items={[
              { label: 'Contract value', value: money(f.contract.currentContract) },
              { label: 'Forecast final cost', value: money(f.forecastCost) },
              ...(showMargins
                ? [
                    { label: 'Forecast profit', value: <strong>{money(f.forecastProfit)}</strong> },
                    { label: 'Forecast margin', value: percent(f.forecastMargin) },
                    { label: 'Profit earned to date', value: money(f.forecastProfit * f.revenue.pctComplete) },
                    { label: 'Profit still to earn', value: money(f.forecastProfit * (1 - f.revenue.pctComplete)) },
                  ]
                : []),
              { label: 'Revenue recognised', value: money(f.revenue.revenueEarned) },
              { label: 'Revenue remaining', value: money(f.revenue.remainingRevenue) },
              { label: 'Cost still to spend', value: money(f.eac.estimateToComplete) },
            ]}
          />
        </div>
      </Section>
    </div>
  )
}
