import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { compareForecast, sumBy } from '@/lib/finance'
import { date, money, moneyShort, percent, titleize } from '@/lib/format'
import { EmptyState, KpiGrid, MoneyKpi, Kpi, Section, StatusPill, Variance, InfoNote, DataList } from '@/components/ui'
import { ChartFrame, BarChart } from '@/components/charts/primitives'
import { AlertList } from '@/components/dashboard/alert-list'
import { ForecastTable } from '@/components/project/forecast-table'
import { saveForecastLine, lockForecastPeriod, openForecastPeriod, setEacMethod } from './actions'

export default async function ForecastPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, alerts, previousEacByCostCode } = bundle
  const canEdit = can(user.role, 'edit:forecast')
  const canLock = can(user.role, 'lock:forecast')

  const periods = await prisma.forecastPeriod.findMany({
    where: { projectId: id },
    include: { lines: { include: { costCode: true } } },
    orderBy: { periodEnd: 'desc' },
  })

  const current = periods.find((p) => p.status === 'OPEN') ?? periods[0]
  const locked = periods.filter((p) => p.status === 'LOCKED')

  const rows = compareForecast(
    f.lines.map((l) => {
      const stored = current?.lines.find((x) => x.costCodeId === l.costCodeId)
      return {
        costCodeId: l.costCodeId,
        code: l.code,
        description: l.description,
        currentBudget: l.currentBudget,
        costToDate: l.totalCostToDate,
        committed: l.committed,
        estimateAtCompletion: l.forecastAtCompletion,
        pctComplete: l.effectivePctComplete,
        riskLevel: stored?.riskLevel ?? 'LOW',
        note: stored?.note ?? null,
      }
    }),
    previousEacByCostCode,
  )

  const movers = rows.filter((r) => Math.abs(r.delta) > 0.005)
  const deterioration = movers.filter((r) => r.delta > 0).reduce((a, r) => a + r.delta, 0)
  const improvement = movers.filter((r) => r.delta < 0).reduce((a, r) => a + r.delta, 0)
  const missingNotes = movers.filter((r) => Math.abs(r.delta) > 5_000 && !r.note)

  // History across every locked period, so the trend is visible.
  const history = [...locked]
    .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())
    .map((p) => ({
      periodEnd: p.periodEnd,
      eac: sumBy(p.lines, (l) => l.estimateAtCompletion),
      budget: sumBy(p.lines, (l) => l.currentBudget),
      costToDate: sumBy(p.lines, (l) => l.costToDate),
    }))
  const historyWithCurrent = [
    ...history,
    ...(current && current.status === 'OPEN'
      ? [{ periodEnd: current.periodEnd, eac: f.eac.bottomUp, budget: f.currentBudget, costToDate: f.totalCostToDate }]
      : []),
  ]

  return (
    <div className="space-y-6">
      <Section title="Forecast position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Current budget" amount={f.currentBudget} />
          <MoneyKpi label="Cost to date" amount={f.totalCostToDate} detail={<>Accruals {moneyShort(f.accruals)}</>} />
          <MoneyKpi label="Estimate to complete" amount={f.eac.estimateToComplete} />
          <MoneyKpi
            label="Estimate at completion"
            amount={f.forecastCost}
            tone={f.eac.varianceAtCompletion < 0 ? 'adverse' : 'favorable'}
            detail={<Variance value={f.eac.varianceAtCompletion} compact />}
          />
          <MoneyKpi
            label="Month-over-month"
            amount={deterioration + improvement}
            tone={deterioration + improvement > 0 ? 'adverse' : 'favorable'}
            detail={`${movers.length} lines moved`}
            hint="Change in total forecast cost since the last locked period."
          />
          <Kpi
            label="Forecast margin"
            value={percent(f.forecastMargin)}
            tone={f.forecastMargin < project.targetMarginPct ? 'caution' : 'favorable'}
            detail={
              <>
                <Variance value={f.marginVsTarget} format="percent" /> vs {percent(project.targetMarginPct, 0)} target
              </>
            }
          />
        </KpiGrid>
      </Section>

      {alerts.filter((a) => a.category === 'Forecast' || a.category === 'Budget').length > 0 && (
        <Section title="Forecast alerts">
          <AlertList alerts={alerts.filter((a) => a.category === 'Forecast' || a.category === 'Budget')} showProject={false} />
        </Section>
      )}

      {missingNotes.length > 0 && (
        <InfoNote>
          {missingNotes.length} cost code{missingNotes.length === 1 ? '' : 's'} moved more than $5,000 without an explanation:{' '}
          {missingNotes.map((r) => r.code).join(', ')}. Every material movement needs a written reason before the period is locked.
        </InfoNote>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartFrame title="Forecast history" subtitle="Estimate at completion against budget across locked periods" className="lg:col-span-2">
          {historyWithCurrent.length > 1 ? (
            <BarChart
              labels={historyWithCurrent.map((h) => date(h.periodEnd))}
              height={240}
              format="moneyShort"
              series={[
                { key: 'budget', label: 'Current budget', values: historyWithCurrent.map((h) => h.budget), color: 'var(--series-neutral)' },
                { key: 'eac', label: 'Estimate at completion', values: historyWithCurrent.map((h) => h.eac), color: 'var(--accent)' },
                { key: 'cost', label: 'Cost to date', values: historyWithCurrent.map((h) => h.costToDate), color: 'var(--caution)' },
              ]}
            />
          ) : (
            <EmptyState title="Only one period on record" description="Lock this period to start building the comparison." />
          )}
        </ChartFrame>

        <ChartFrame title="Estimate at completion method" subtitle="The three methods, and which one this project uses">
          <DataList
            columns={1}
            items={[
              { label: 'Bottom-up (line forecasts)', value: money(f.eac.bottomUp) },
              { label: 'Performance (BAC ÷ CPI)', value: money(f.eac.cpiBased) },
              { label: 'Budget rate (AC + BAC − EV)', value: money(f.eac.budgetRate) },
              { label: 'Selected', value: <strong>{titleize(f.eac.method)}</strong> },
              { label: 'Variance at completion', value: <Variance value={f.eac.varianceAtCompletion} /> },
            ]}
          />
          {canEdit && (
            <form action={setEacMethod} className="mt-3 flex items-end gap-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
              <input type="hidden" name="projectId" value={project.id} />
              <div className="flex-1">
                <label htmlFor="eac-method" className="label mb-1.5 block">
                  Change method
                </label>
                <select id="eac-method" name="eacMethod" className="field text-xs" defaultValue={project.eacMethod}>
                  <option value="BOTTOM_UP">Bottom-up: the managers&apos; line forecasts</option>
                  <option value="CPI_BASED">Performance: assumes current efficiency holds</option>
                  <option value="BUDGET_RATE">Budget rate: assumes remaining work runs at budget</option>
                </select>
              </div>
              <button type="submit" className="btn btn-secondary">
                Apply
              </button>
            </form>
          )}
        </ChartFrame>
      </div>

      <Section
        title={current ? `Forecast: period ending ${date(current.periodEnd)}` : 'Forecast'}
        description="Enter percent complete and, where the budget no longer holds, an estimate to complete. Everything else derives."
        actions={
          current && canLock ? (
            current.status === 'OPEN' ? (
              <form action={lockForecastPeriod}>
                <input type="hidden" name="periodId" value={current.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <button type="submit" className="btn btn-primary text-xs">
                  Lock this period
                </button>
              </form>
            ) : (
              <form action={openForecastPeriod}>
                <input type="hidden" name="periodId" value={current.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <button type="submit" className="btn btn-secondary text-xs">
                  Reopen period
                </button>
              </form>
            )
          ) : undefined
        }
      >
        {!current ? (
          <EmptyState title="No forecast period open" description="Create one from the project settings to begin forecasting." />
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <StatusPill status={current.status} />
              {current.lockedAt && (
                <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                  Locked {date(current.lockedAt)}: the snapshot is preserved for comparison
                </span>
              )}
            </div>
            <ForecastTable
              rows={rows}
              projectId={project.id}
              periodId={current.id}
              canEdit={canEdit && current.status === 'OPEN'}
              save={saveForecastLine}
            />
          </>
        )}
      </Section>

      {locked.length > 0 && (
        <Section title="Locked periods" description="Historical forecasts, preserved exactly as they were signed off">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Period end</th>
                    <th>Locked</th>
                    <th className="num">Budget</th>
                    <th className="num">Cost to date</th>
                    <th className="num">Estimate at completion</th>
                    <th className="num">Variance</th>
                    <th className="num">Lines</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {locked.map((p) => {
                    const budget = sumBy(p.lines, (l) => l.currentBudget)
                    const eac = sumBy(p.lines, (l) => l.estimateAtCompletion)
                    return (
                      <tr key={p.id}>
                        <td className="font-medium">{date(p.periodEnd)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(p.lockedAt)}</td>
                        <td className="num">{money(budget)}</td>
                        <td className="num">{money(sumBy(p.lines, (l) => l.costToDate))}</td>
                        <td className="num">{money(eac)}</td>
                        <td className="num">
                          <Variance value={budget - eac} />
                        </td>
                        <td className="num">{p.lines.length}</td>
                        <td>
                          <StatusPill status={p.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
