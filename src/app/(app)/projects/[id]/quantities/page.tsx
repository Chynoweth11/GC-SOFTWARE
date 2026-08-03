import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { overallQuantityProgress, sumBy } from '@/lib/finance'
import { date, number as fmtNumber, percent } from '@/lib/format'
import { EmptyState, KpiGrid, Kpi, Section, Variance, InfoNote } from '@/components/ui'
import { ChartFrame, HorizontalBars, Meter } from '@/components/charts/primitives'
import { QuantityEntryForm } from '@/components/project/quantity-entry-form'
import { recordProgress } from './actions'

export default async function QuantitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, quantities } = bundle
  const canEdit = can(user.role, 'edit:costs')

  const items = await prisma.quantityItem.findMany({
    where: { projectId: id },
    include: { costCode: true, entries: { orderBy: { periodEnd: 'desc' } } },
    orderBy: { sortOrder: 'asc' },
  })

  if (quantities.length === 0) {
    return (
      <EmptyState
        title="No quantity items tracked yet"
        description="Quantity tracking measures physical production and labour productivity — the earliest warning that a self-perform trade is going wrong."
      />
    )
  }

  const totalBudgetHours = sumBy(quantities, (q) => q.budgetHours)
  const totalEarnedHours = sumBy(quantities, (q) => q.earnedHours)
  const totalActualHours = sumBy(quantities, (q) => q.actualHours)
  const totalForecastHours = sumBy(quantities, (q) => q.forecastHoursAtCompletion)
  const overallProductivity = totalActualHours > 0 ? totalEarnedHours / totalActualHours : 0
  const progress = overallQuantityProgress(quantities) ?? 0

  const behind = quantities.filter((q) => q.productivityFactor > 0 && q.productivityFactor < 0.95)

  return (
    <div className="space-y-6">
      <Section title="Production and productivity">
        <KpiGrid cols={6}>
          <Kpi label="Physical progress" value={percent(progress)} chart={<Meter value={progress} showLabel={false} />} hint="Earned labour hours ÷ budget hours." />
          <Kpi label="Budget hours" value={fmtNumber(totalBudgetHours, 0)} />
          <Kpi label="Earned hours" value={fmtNumber(totalEarnedHours, 0)} detail="Installed quantity at the budget rate" />
          <Kpi label="Actual hours" value={fmtNumber(totalActualHours, 0)} />
          <Kpi
            label="Productivity factor"
            value={overallProductivity.toFixed(3)}
            tone={overallProductivity >= 1 ? 'favorable' : overallProductivity >= 0.95 ? 'caution' : 'adverse'}
            hint="Earned hours ÷ actual hours. Above 1 means beating the budget rate."
          />
          <Kpi
            label="Forecast hours at completion"
            value={fmtNumber(totalForecastHours, 0)}
            tone={totalForecastHours > totalBudgetHours ? 'adverse' : 'favorable'}
            detail={
              <>
                <Variance value={totalBudgetHours - totalForecastHours} format="money" compact showSign /> vs budget
              </>
            }
          />
        </KpiGrid>
      </Section>

      {behind.length > 0 && (
        <InfoNote>
          {behind.length} work item{behind.length === 1 ? ' is' : 's are'} running below the budget production rate:{' '}
          {behind.map((q) => q.description).slice(0, 3).join(', ')}
          {behind.length > 3 ? ` and ${behind.length - 3} more` : ''}. At the current rate they will consume{' '}
          {fmtNumber(sumBy(behind, (q) => q.forecastHoursAtCompletion - q.budgetHours), 0)} hours more than budgeted.
        </InfoNote>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Productivity factor by work item" subtitle="Above 1.0 is beating the budget rate">
          <HorizontalBars
            labels={quantities.map((q) => q.description)}
            format="number"
            series={[{ key: 'pf', label: 'Productivity factor', values: quantities.map((q) => q.productivityFactor) }]}
          />
        </ChartFrame>

        <ChartFrame title="Hours: budget, earned, actual and forecast">
          <HorizontalBars
            labels={quantities.map((q) => q.description)}
            format="hours"
            series={[
              { key: 'budget', label: 'Budget hours', values: quantities.map((q) => q.budgetHours) },
              { key: 'actual', label: 'Actual hours', values: quantities.map((q) => q.actualHours), color: 'var(--caution)' },
              { key: 'forecast', label: 'Forecast hours', values: quantities.map((q) => q.forecastHoursAtCompletion), color: 'var(--adverse)' },
            ]}
          />
        </ChartFrame>
      </div>

      <Section title="Quantity tracking" description="Installed quantities, productivity and forecast completion by work item">
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Work item</th>
                  <th>Cost code</th>
                  <th>UOM</th>
                  <th className="num">Budget qty</th>
                  <th className="num">Installed</th>
                  <th className="num">Remaining</th>
                  <th style={{ minWidth: 110 }}>% installed</th>
                  <th className="num">Budget rate</th>
                  <th className="num">Actual rate</th>
                  <th className="num">Budget hours</th>
                  <th className="num">Earned hours</th>
                  <th className="num">Actual hours</th>
                  <th className="num">Hours variance</th>
                  <th className="num">Productivity</th>
                  <th className="num">Forecast hours</th>
                  <th className="num">Forecast variance</th>
                  <th className="num">Daily production</th>
                  <th className="num">Days to complete</th>
                  <th className="num">Material overage</th>
                </tr>
              </thead>
              <tbody>
                {quantities.map((q) => (
                  <tr key={q.itemId} style={q.productivityFactor > 0 && q.productivityFactor < 0.95 ? { background: 'color-mix(in oklab, var(--adverse) 5%, transparent)' } : undefined}>
                    <td className="max-w-[16rem] truncate font-medium" title={q.description}>
                      {q.description}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{q.costCode ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{q.uom}</td>
                    <td className="num">{fmtNumber(q.budgetQty)}</td>
                    <td className="num">{fmtNumber(q.installedToDate)}</td>
                    <td className="num">{fmtNumber(q.remainingQty)}</td>
                    <td>
                      <Meter value={q.pctInstalled} showLabel={false} height={4} />
                      <span className="tnum text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                        {percent(q.pctInstalled, 0)}
                      </span>
                    </td>
                    <td className="num">{q.budgetUnitRate.toFixed(3)}</td>
                    <td className="num" style={{ color: q.actualUnitRate > q.budgetUnitRate ? 'var(--adverse)' : undefined }}>
                      {q.actualUnitRate.toFixed(3)}
                    </td>
                    <td className="num">{fmtNumber(q.budgetHours, 1)}</td>
                    <td className="num">{fmtNumber(q.earnedHours, 1)}</td>
                    <td className="num">{fmtNumber(q.actualHours, 1)}</td>
                    <td className="num">
                      <span style={{ color: q.hoursVariance < 0 ? 'var(--adverse)' : 'var(--favorable)' }}>
                        {q.hoursVariance > 0 ? '+' : ''}
                        {fmtNumber(q.hoursVariance, 1)}
                      </span>
                    </td>
                    <td className="num" style={{ color: q.productivityFactor >= 1 ? 'var(--favorable)' : 'var(--adverse)' }}>
                      {q.productivityFactor.toFixed(3)}
                    </td>
                    <td className="num">{fmtNumber(q.forecastHoursAtCompletion, 1)}</td>
                    <td className="num">
                      <span style={{ color: q.forecastHoursVariance < 0 ? 'var(--adverse)' : 'var(--favorable)' }}>
                        {q.forecastHoursVariance > 0 ? '+' : ''}
                        {fmtNumber(q.forecastHoursVariance, 1)}
                      </span>
                    </td>
                    <td className="num">{fmtNumber(q.avgDailyProduction, 1)}</td>
                    <td className="num">{q.daysToComplete || '—'}</td>
                    <td className="num" style={{ color: q.materialOveragePct > 0.1 ? 'var(--caution)' : undefined }}>
                      {q.materialOrderedQty ? percent(q.materialOveragePct, 1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={9}>Total — {quantities.length} work items</td>
                  <td className="num">{fmtNumber(totalBudgetHours, 1)}</td>
                  <td className="num">{fmtNumber(totalEarnedHours, 1)}</td>
                  <td className="num">{fmtNumber(totalActualHours, 1)}</td>
                  <td className="num">{fmtNumber(totalEarnedHours - totalActualHours, 1)}</td>
                  <td className="num">{overallProductivity.toFixed(3)}</td>
                  <td className="num">{fmtNumber(totalForecastHours, 1)}</td>
                  <td className="num">{fmtNumber(totalBudgetHours - totalForecastHours, 1)}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Section>

      {canEdit && (
        <Section title="Record this period's production" description="Installed quantity and hours worked, by work item">
          <QuantityEntryForm
            projectId={project.id}
            items={items.map((i) => ({
              id: i.id,
              label: `${i.description} (${i.uom})`,
              lastPeriod: i.entries[0]?.periodEnd.toISOString().slice(0, 10) ?? null,
            }))}
            action={recordProgress}
          />
        </Section>
      )}

      <Section title="Production history" description="Each period's recorded installation and hours">
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Work item</th>
                  <th>Period end</th>
                  <th className="num">Installed</th>
                  <th className="num">Hours</th>
                  <th className="num">Crew days</th>
                  <th className="num">Rate achieved</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {items.flatMap((item) =>
                  item.entries.map((e) => (
                    <tr key={e.id}>
                      <td className="max-w-[16rem] truncate">{item.description}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(e.periodEnd)}</td>
                      <td className="num">{fmtNumber(e.installedQty)}</td>
                      <td className="num">{fmtNumber(e.actualHours, 1)}</td>
                      <td className="num">{fmtNumber(e.crewDays)}</td>
                      <td className="num">{e.installedQty ? (e.actualHours / e.installedQty).toFixed(3) : '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.notes ?? '—'}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
