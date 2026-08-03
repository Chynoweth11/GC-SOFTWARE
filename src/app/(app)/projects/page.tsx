import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getCompanyDashboard, parseProjectFilter } from '@/lib/queries/company'
import { date, money, moneyShort, percent } from '@/lib/format'
import { EmptyState, KpiGrid, MoneyKpi, PageHeader, Section, StatusPill, Variance } from '@/components/ui'
import { ChartFrame, HorizontalBars, Meter } from '@/components/charts/primitives'
import { ProjectFilters } from '@/components/dashboard/project-filters'

export const metadata = { title: 'Projects' }

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const filter = parseProjectFilter(await searchParams)
  const data = await getCompanyDashboard(user.companyId, filter)
  const showMargins = can(user.role, 'view:margins')

  const sorted = [...data.projects].sort(
    (a, b) => b.financials.contract.currentContract - a.financials.contract.currentContract,
  )

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${data.projects.length} of ${data.totals.projectCount} projects · ${moneyShort(data.totals.currentContract)} under contract`}
      />

      <ProjectFilters options={data.filterOptions} current={filter} />

      {sorted.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="No projects match these filters"
            description="Adjust or clear the filters above to see the rest of the portfolio."
            action={
              <Link href="/projects" className="btn btn-secondary">
                Clear filters
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <Section className="mb-5 mt-5">
            <KpiGrid cols={5}>
              <MoneyKpi label="Contract value" amount={data.totals.currentContract} />
              <MoneyKpi label="Cost to date" amount={data.totals.actualCost} />
              <MoneyKpi label="Forecast cost" amount={data.totals.forecastCost} />
              {showMargins && (
                <MoneyKpi
                  label="Forecast profit"
                  amount={data.totals.forecastProfit}
                  tone={data.totals.forecastProfit < 0 ? 'adverse' : 'favorable'}
                  detail={percent(data.totals.grossMargin)}
                />
              )}
              <MoneyKpi label="Backlog" amount={data.totals.backlog} />
            </KpiGrid>
          </Section>

          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartFrame title="Contract value by project" subtitle="Cost to date shown against contract">
              <HorizontalBars
                labels={sorted.map((p) => `${p.number} ${p.name}`)}
                format="moneyShort"
                series={[
                  { key: 'contract', label: 'Contract', values: sorted.map((p) => p.financials.contract.currentContract) },
                  { key: 'cost', label: 'Cost to date', values: sorted.map((p) => p.financials.totalCostToDate), color: 'var(--caution)' },
                ]}
              />
            </ChartFrame>

            {showMargins && (
              <ChartFrame title="Forecast margin by project" subtitle={`Company target ${percent(data.company.targetMarginPct, 0)}`}>
                <HorizontalBars
                  labels={sorted.map((p) => `${p.number} ${p.name}`)}
                  format="percent"
                  series={[{ key: 'margin', label: 'Forecast margin', values: sorted.map((p) => p.financials.forecastMargin) }]}
                />
              </ChartFrame>
            )}
          </div>

          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Manager</th>
                    <th>Status</th>
                    <th>Completion</th>
                    <th className="num">Contract</th>
                    <th className="num">Budget</th>
                    <th className="num">Cost to date</th>
                    <th className="num">Committed</th>
                    <th className="num">EAC</th>
                    <th className="num">EAC variance</th>
                    {showMargins && <th className="num">Profit</th>}
                    {showMargins && <th className="num">Margin</th>}
                    <th className="num">Billed</th>
                    <th className="num">AR</th>
                    <th style={{ minWidth: 110 }}>Progress</th>
                    <th>Schedule</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => {
                    const f = p.financials
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/projects/${p.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                            {p.number}
                          </Link>
                        </td>
                        <td className="max-w-[15rem] truncate" title={p.name}>
                          <Link href={`/projects/${p.id}`} className="hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="max-w-[11rem] truncate" style={{ color: 'var(--text-muted)' }}>
                          {p.clientName ?? '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{p.pmName ?? '—'}</td>
                        <td>
                          <StatusPill status={p.status} />
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(p.forecastCompletion)}</td>
                        <td className="num">{money(f.contract.currentContract)}</td>
                        <td className="num">{money(f.currentBudget)}</td>
                        <td className="num">{money(f.totalCostToDate)}</td>
                        <td className="num">{money(f.committed)}</td>
                        <td className="num">{money(f.forecastCost)}</td>
                        <td className="num">
                          <Variance value={f.eac.varianceAtCompletion} compact />
                        </td>
                        {showMargins && (
                          <td className="num">
                            <Variance value={f.forecastProfit} showSign={false} />
                          </td>
                        )}
                        {showMargins && (
                          <td className="num" style={{ color: f.forecastMargin < data.company.targetMarginPct ? 'var(--caution)' : 'var(--favorable)' }}>
                            {percent(f.forecastMargin)}
                          </td>
                        )}
                        <td className="num">{money(f.billing.totalCompletedAndStored)}</td>
                        <td className="num">{money(f.billing.accountsReceivable)}</td>
                        <td>
                          <Meter value={f.revenue.pctComplete} />
                        </td>
                        <td>
                          <StatusPill status={f.health.scheduleStatus} />
                        </td>
                        <td>
                          <StatusPill status={f.health.flag} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Total</td>
                    <td className="num">{money(data.totals.currentContract)}</td>
                    <td className="num">{money(data.totals.currentBudget)}</td>
                    <td className="num">{money(data.totals.actualCost)}</td>
                    <td className="num">{money(data.totals.committedCost)}</td>
                    <td className="num">{money(data.totals.forecastCost)}</td>
                    <td className="num">{money(data.totals.currentBudget - data.totals.forecastCost)}</td>
                    {showMargins && <td className="num">{money(data.totals.forecastProfit)}</td>}
                    {showMargins && <td className="num">{percent(data.totals.grossMargin)}</td>}
                    <td className="num">{money(data.totals.billedToDate)}</td>
                    <td className="num">{money(data.totals.accountsReceivable)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
