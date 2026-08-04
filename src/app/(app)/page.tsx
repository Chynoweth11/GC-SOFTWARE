import Link from 'next/link'
import type { ReactNode } from 'react'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getCompanyDashboard, parseProjectFilter } from '@/lib/queries/company'
import { money, moneyShort, percent, number as fmtNumber } from '@/lib/format'
import {
  DataList,
  EmptyState,
  Kpi,
  KpiGrid,
  MoneyKpi,
  PageHeader,
  Pill,
  Section,
  StatusPill,
  Variance,
} from '@/components/ui'
import { ChartFrame, DonutChart, HorizontalBars, Meter } from '@/components/charts/primitives'
import { PeriodSeriesChart } from '@/components/charts/period-series'
import { ProjectFilters } from '@/components/dashboard/project-filters'
import { SavedViews } from '@/components/dashboard/saved-views'
import { listSavedViews } from '@/lib/queries/views'
import { saveView, deleteView, saveDashboardLayout } from './views-actions'
import { CustomizeDashboard } from '@/components/dashboard/customize'
import { DASHBOARD_PANELS, resolveLayout } from '@/lib/dashboard-panels'
import { getPreference } from '@/lib/queries/views'
import { AlertList } from '@/components/dashboard/alert-list'

export const metadata = { title: 'Company dashboard' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const params = await searchParams
  const filter = parseProjectFilter(params)
  const [data, savedViews, storedLayout] = await Promise.all([
    getCompanyDashboard(user.companyId, filter),
    listSavedViews('dashboard', user),
    getPreference(user.id, 'dashboard.layout'),
  ])
  const { totals, projects, pipeline, cashFlow, revenueForecast, alerts } = data
  const asOfIso = (cashFlow.at(-1)?.periodEnd ?? new Date()).toISOString()

  const showCompany = can(user.role, 'view:company_financials')
  const showMargins = can(user.role, 'view:margins')
  const showCash = can(user.role, 'view:cash_position')

  // Role decides which panels exist; preference only orders and hides them.
  const permittedPanels = DASHBOARD_PANELS.filter((panel) => {
    if (panel.id === 'cashflow') return showCash
    // The billing panel carries both the company position and the cash breakdown,
    // so it needs both capabilities rather than either one.
    if (panel.id === 'billing') return showCompany && showCash
    if (panel.id === 'revenue') return showCompany
    if (panel.id === 'pipeline') return can(user.role, 'view:pipeline')
    if (panel.id === 'alerts') return data.alerts.length > 0
    return true
  })
  const layout = resolveLayout(storedLayout, permittedPanels.map((p) => p.id))
  const visiblePanels = layout.order.filter((id) => !layout.hidden.includes(id))

  if (projects.length === 0) {
    return (
      <>
        <PageHeader title="Company dashboard" subtitle={data.company.name} />
        <EmptyState
          title="No projects match these filters"
          description="Clear the filters to see the whole portfolio, or add your first project to begin tracking its financial position."
          action={
            <Link href="/" className="btn btn-secondary">
              Clear filters
            </Link>
          }
        />
      </>
    )
  }

  // ── Chart data, all derived from the same engine output the tiles use ───
  const backlogByProject = [...projects]
    .sort((a, b) => b.financials.backlog - a.financials.backlog)
    .slice(0, 10)

  const marginByProject = [...projects].sort((a, b) => b.financials.contract.currentContract - a.financials.contract.currentContract)

  // ── Panels ─────────────────────────────────────────────────────────────
  // Each is built once and placed by the user's saved order below. Building
  // them as a map rather than inline JSX is what makes the order a datum
  // rather than a hard-coded sequence.
  const panelContent: Record<string, ReactNode> = {
    portfolio: (
      <Section title="Portfolio position">
        <KpiGrid cols={5}>
          <MoneyKpi
            label="Current contract value"
            amount={totals.currentContract}
            detail={
              <>
                Original {moneyShort(totals.originalContract)} · approved COs {moneyShort(totals.approvedChangeOrders)}
              </>
            }
            hint="Original contract sum plus every approved owner change order, across all projects in view."
          />
          <MoneyKpi
            label="Backlog"
            amount={totals.backlog}
            detail={`${percent(totals.weightedPctComplete)} weighted complete`}
            hint="Current contract value less what has been billed: the revenue still to be earned."
          />
          {showCompany && (
            <MoneyKpi
              label="Revenue earned"
              amount={totals.revenueEarned}
              detail={<>Billed {moneyShort(totals.billedToDate)}</>}
              hint="Contract value × percent complete, using each project's selected percentage-of-completion method."
            />
          )}
          {showMargins && (
            <MoneyKpi
              label="Forecast profit"
              amount={totals.forecastProfit}
              tone={totals.forecastProfit < 0 ? 'adverse' : 'favorable'}
              detail={
                <>
                  {percent(totals.grossMargin)} margin ·{' '}
                  <Variance value={totals.grossMargin - data.company.targetMarginPct} format="percent" /> vs target
                </>
              }
              hint="Forecast contract value less the selected estimate at completion, summed across the portfolio."
            />
          )}
          {showCash && (
            <MoneyKpi
              label="Accounts receivable"
              amount={totals.accountsReceivable}
              tone={totals.accountsReceivable > totals.currentContract * 0.15 ? 'caution' : 'neutral'}
              detail={<>Retention held {moneyShort(totals.retentionReceivable)}</>}
              hint="Sum of every submitted pay application not yet collected."
            />
          )}
        </KpiGrid>
      </Section>
    ),
    cost: (
      <Section title="Cost, commitment and cash position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Current budget" amount={totals.currentBudget} detail={<>Original {moneyShort(totals.originalBudget)}</>} />
          <MoneyKpi label="Actual cost" amount={totals.actualCost} detail={`${percent(totals.actualCost / (totals.forecastCost || 1))} of forecast`} />
          <MoneyKpi label="Committed" amount={totals.committedCost} hint="Executed subcontracts and purchase orders, including approved changes." />
          <MoneyKpi
            label="Estimate at completion"
            amount={totals.estimateAtCompletion}
            tone={totals.estimateAtCompletion > totals.currentBudget ? 'adverse' : 'neutral'}
            detail={<Variance value={totals.currentBudget - totals.estimateAtCompletion} compact />}
            hint="The forecast final cost under each project's selected EAC method."
          />
          <MoneyKpi label="Estimate to complete" amount={totals.estimateToComplete} hint="Forecast cost still to be spent." />
          {showCash && <MoneyKpi label="Accounts payable" amount={totals.accountsPayable} detail={<>Retention payable {moneyShort(totals.retentionPayable)}</>} />}
        </KpiGrid>
      </Section>
    ),
    cashflow: (
      <PeriodSeriesChart
        title="Company cash flow"
        subtitle="Collections against cost, with the cumulative position"
        className="xl:col-span-2"
        kind="line"
        height={260}
        asOf={asOfIso}
        points={cashFlow.map((r) => ({
          date: r.periodEnd.toISOString(),
          values: { cash: r.cumulativeCash, collections: r.collections, costs: r.costs },
        }))}
        series={[
          { key: 'cash', label: 'Cumulative cash', color: 'var(--accent)', area: true, cumulative: true },
          { key: 'collections', label: 'Collections', color: 'var(--favorable)' },
          { key: 'costs', label: 'Cost outflow', color: 'var(--adverse)' },
        ]}
      />
    ),
    backlog: (
      <ChartFrame title="Backlog by project" subtitle="Revenue still to be earned">
        <HorizontalBars
          labels={backlogByProject.map((p) => `${p.number} ${p.name}`)}
          format="moneyShort"
          series={[{ key: 'backlog', label: 'Backlog', values: backlogByProject.map((p) => p.financials.backlog) }]}
        />
      </ChartFrame>
    ),
    revenue: (
      <PeriodSeriesChart
        title="Revenue and profit forecast"
        subtitle="Derived from every project's cost curve"
        className="xl:col-span-2"
        height={250}
        asOf={asOfIso}
        points={revenueForecast.map((r) => ({
          date: r.periodEnd.toISOString(),
          values: { revenue: r.revenue, cost: r.cost, profit: r.grossProfit },
        }))}
        series={[
          { key: 'revenue', label: 'Revenue', color: 'var(--accent)' },
          { key: 'cost', label: 'Cost', color: 'var(--series-neutral)' },
          { key: 'profit', label: 'Gross profit', color: 'var(--favorable)' },
        ]}
      />
    ),
    billing: (
      <ChartFrame title="Billing position" subtitle="Over- and underbilling across the portfolio">
        <DonutChart
          format="moneyShort"
          centerLabel="Net position"
          centerValue={moneyShort(totals.overbilled - totals.underbilled)}
          slices={[
            { label: 'Overbilled', value: totals.overbilled, color: 'var(--favorable)' },
            { label: 'Underbilled', value: totals.underbilled, color: 'var(--adverse)' },
          ]}
        />
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <DataList
            columns={1}
            items={[
              { label: 'Cash collected', value: money(totals.cashCollected) },
              { label: 'Receivable', value: money(totals.accountsReceivable) },
              { label: 'Retention receivable', value: money(totals.retentionReceivable) },
              { label: 'Retention payable', value: money(totals.retentionPayable) },
            ]}
          />
        </div>
      </ChartFrame>
    ),
    alerts: (
      <Section title="Attention required" description="Recomputed from live data every time this page loads">
        <AlertList alerts={alerts.slice(0, 8)} />
      </Section>
    ),
    projects: (
      <Section
        title="Projects"
        description="Every figure below comes from the same calculation engine as the project pages"
        actions={
          <Link href="/projects" className="btn btn-ghost text-xs">
            Open projects →
          </Link>
        }

      >
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Project</th>
                  <th>Manager</th>
                  <th>Status</th>
                  <th className="num">Contract</th>
                  <th className="num">Cost to date</th>
                  <th className="num">Forecast cost</th>
                  {showMargins && <th className="num">Forecast profit</th>}
                  {showMargins && <th className="num">Margin</th>}
                  <th className="num">Billed</th>
                  <th className="num">Backlog</th>
                  <th style={{ minWidth: 120 }}>% complete</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {marginByProject.map((p) => {
                  const f = p.financials
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/projects/${p.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                          {p.number}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] truncate" title={p.name}>
                        {p.name}
                        <div className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          {p.clientName}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.pmName ?? '-'}</td>
                      <td>
                        <StatusPill status={p.status} />
                      </td>
                      <td className="num">{money(f.contract.currentContract)}</td>
                      <td className="num">{money(f.totalCostToDate)}</td>
                      <td className="num">{money(f.forecastCost)}</td>
                      {showMargins && (
                        <td className="num">
                          <Variance value={f.forecastProfit} showSign={false} />
                        </td>
                      )}
                      {showMargins && (
                        <td className="num">
                          <span style={{ color: f.forecastMargin < data.company.targetMarginPct ? 'var(--caution)' : 'var(--favorable)' }}>
                            {percent(f.forecastMargin)}
                          </span>
                        </td>
                      )}
                      <td className="num">{money(f.billing.totalCompletedAndStored)}</td>
                      <td className="num">{money(f.backlog)}</td>
                      <td>
                        <Meter value={f.revenue.pctComplete} />
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
                  <td colSpan={4}>Portfolio total, {projects.length} projects</td>
                  <td className="num">{money(totals.currentContract)}</td>
                  <td className="num">{money(totals.actualCost)}</td>
                  <td className="num">{money(totals.forecastCost)}</td>
                  {showMargins && <td className="num">{money(totals.forecastProfit)}</td>}
                  {showMargins && <td className="num">{percent(totals.grossMargin)}</td>}
                  <td className="num">{money(totals.billedToDate)}</td>
                  <td className="num">{money(totals.backlog)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Section>
    ),
    pipeline: (
      <Section
        title="Bid pipeline"
        actions={
          <Link href="/pipeline" className="btn btn-ghost text-xs">
            Open pipeline →
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <KpiGrid cols={4}>
              <Kpi label="Active bids" value={fmtNumber(pipeline.activeBids)} detail={`${pipeline.bidsDueNext14Days} due in 14 days`} />
              <MoneyKpi label="Open pipeline" amount={pipeline.openPipelineValue} />
              <MoneyKpi label="Weighted pipeline" amount={pipeline.weightedPipeline} hint="Value × win probability for every open opportunity." />
              <Kpi
                label="Win rate"
                value={percent(pipeline.winRateByCount, 0)}
                detail={`${percent(pipeline.winRateByValue, 0)} by value`}
                tone={pipeline.winRateByCount >= 0.4 ? 'favorable' : 'caution'}
              />
            </KpiGrid>
            {pipeline.followUpsOverdue > 0 && (
              <div className="mt-3">
                <Link href="/pipeline?followUp=overdue" className="block">
                  <div
                    className="rounded-lg border px-3 py-2 text-xs"
                    style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
                  >
                    {pipeline.followUpsOverdue} follow-up{pipeline.followUpsOverdue === 1 ? ' is' : 's are'} overdue and{' '}
                    {pipeline.followUpsDueThisWeek} due this week.
                  </div>
                </Link>
              </div>
            )}
          </div>

          <ChartFrame title="Pipeline by stage">
            <HorizontalBars
              labels={pipeline.byStatus.map((s) => s.status.replace(/_/g, ' ').toLowerCase())}
              format="moneyShort"
              series={[
                { key: 'value', label: 'Value', values: pipeline.byStatus.map((s) => s.value) },
                { key: 'weighted', label: 'Weighted', values: pipeline.byStatus.map((s) => s.weighted), color: 'var(--favorable)' },
              ]}
            />
          </ChartFrame>
        </div>
      </Section>
    ),
  }

  return (
    <>
      <PageHeader
        title="Company dashboard"
        subtitle={
          <>
            {data.company.name} · {projects.length} project{projects.length === 1 ? '' : 's'} · target margin{' '}
            {percent(data.company.targetMarginPct, 0)}
          </>
        }
        meta={
          <>
            <Pill tone={totals.projectsAtHighRisk > 0 ? 'adverse' : 'favorable'} dot>
              {totals.projectsAtHighRisk} at high risk
            </Pill>
            <Pill tone={totals.projectsOnWatch > 0 ? 'caution' : 'neutral'} dot>
              {totals.projectsOnWatch} on watch
            </Pill>
            <Pill tone={totals.projectsBehindSchedule > 0 ? 'caution' : 'favorable'} dot>
              {totals.projectsBehindSchedule} behind schedule
            </Pill>
            <Pill tone={totals.projectsBelowTargetMargin > 0 ? 'caution' : 'favorable'} dot>
              {totals.projectsBelowTargetMargin} below target margin
            </Pill>
          </>
        }
        actions={
          <>
            <Link href="/reports/wip" className="btn btn-secondary">
              WIP schedule
            </Link>
            <Link href="/reports" className="btn btn-secondary">
              All reports
            </Link>
            <CustomizeDashboard panels={permittedPanels} layout={layout} save={saveDashboardLayout} />
          </>
        }
      />

      <SavedViews scope="dashboard" views={savedViews} save={saveView} remove={deleteView} />
      <ProjectFilters options={data.filterOptions} current={filter} />


      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {visiblePanels.map((id) => (
          <div key={id} className={PANEL_SPANS[id] === 3 ? 'xl:col-span-3' : PANEL_SPANS[id] === 2 ? 'xl:col-span-2' : ''}>
            {panelContent[id]}
          </div>
        ))}
      </div>
    </>
  )
}

/** How many of the three dashboard columns each panel occupies on a wide screen. */
const PANEL_SPANS: Record<string, number> = {
    portfolio: 3,
    cost: 3,
    cashflow: 2,
    backlog: 1,
    revenue: 2,
    billing: 1,
    alerts: 3,
    projects: 3,
    pipeline: 3,
}
