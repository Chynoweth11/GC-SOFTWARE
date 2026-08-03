import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { rollupBy } from '@/lib/finance'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import { date, days, money, moneyShort, month, percent, titleize } from '@/lib/format'
import {
  DataList,
  KpiGrid,
  MoneyKpi,
  Kpi,
  Section,
  Variance,
} from '@/components/ui'
import { ChartFrame, DonutChart, HorizontalBars, LineChart, Meter } from '@/components/charts/primitives'
import { AlertList } from '@/components/dashboard/alert-list'

export default async function ProjectSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, cashFlow, alerts } = bundle
  const showMargins = can(user.role, 'view:margins')
  const base = `/projects/${project.id}`

  const byTrade = rollupBy(f.lines, (l) => ({
    key: l.tradeName ?? l.category,
    label: l.tradeName ?? CATEGORY_LABELS[l.category],
  }))

  const dataDateIndex = cashFlow.findIndex((r) => !r.isActual)

  return (
    <div className="space-y-6">
      {alerts.length > 0 && (
        <Section title="Attention required">
          <AlertList alerts={alerts} showProject={false} />
        </Section>
      )}

      {/* ── Contract and profit ───────────────────────────────────────── */}
      <Section title="Contract position">
        <KpiGrid cols={5}>
          <MoneyKpi
            label="Current contract"
            amount={f.contract.currentContract}
            detail={<>Original {moneyShort(f.contract.originalContract)}</>}
            hint="Original contract sum plus approved owner change orders."
          />
          <MoneyKpi
            label="Approved change orders"
            amount={f.contract.approvedChangeOrders}
            href={`${base}/changes`}
            detail={<>Pending {moneyShort(f.contract.pendingChangeOrders)}</>}
          />
          <MoneyKpi
            label="Forecast cost"
            amount={f.forecastCost}
            tone={f.eac.varianceAtCompletion < 0 ? 'adverse' : 'neutral'}
            detail={
              <>
                {titleize(f.eac.method)} · <Variance value={f.eac.varianceAtCompletion} compact /> vs budget
              </>
            }
            href={`${base}/forecast`}
            hint="Estimate at completion under the selected method."
          />
          {showMargins && (
            <MoneyKpi
              label="Forecast profit"
              amount={f.forecastProfit}
              tone={f.forecastProfit < 0 ? 'adverse' : 'favorable'}
              detail={
                <>
                  {percent(f.forecastMargin)} · <Variance value={f.marginVsTarget} format="percent" /> vs {percent(project.targetMarginPct, 0)} target
                </>
              }
            />
          )}
          <Kpi
            label="Percent complete"
            value={percent(f.revenue.pctComplete)}
            detail={titleize(f.revenue.method)}
            href={`${base}/poc`}
            chart={<Meter value={f.revenue.pctComplete} showLabel={false} />}
          />
        </KpiGrid>
      </Section>

      {/* ── Cost position ─────────────────────────────────────────────── */}
      <Section title="Cost position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Current budget" amount={f.currentBudget} href={`${base}/budget`} detail={<>Original {moneyShort(f.originalBudget)}</>} />
          <MoneyKpi label="Committed" amount={f.committed} href={`${base}/commitments`} detail={<>Remaining {moneyShort(f.remainingCommitment)}</>} />
          <MoneyKpi label="Cost to date" amount={f.costToDate} href={`${base}/costs`} detail={<>Accruals {moneyShort(f.accruals)}</>} />
          <MoneyKpi label="Estimate to complete" amount={f.eac.estimateToComplete} />
          <MoneyKpi
            label="Remaining budget"
            amount={f.remainingBudget}
            tone={f.remainingBudget < 0 ? 'adverse' : 'neutral'}
          />
          <MoneyKpi
            label="Cost variance"
            amount={f.costVariance}
            tone={f.costVariance < 0 ? 'adverse' : 'favorable'}
            hint="Earned value less actual cost. Negative means the work in place cost more than it was budgeted to."
          />
        </KpiGrid>
      </Section>

      {/* ── Billing and cash ──────────────────────────────────────────── */}
      <Section title="Billing and cash">
        <KpiGrid cols={6}>
          <MoneyKpi label="Billed to date" amount={f.billing.totalCompletedAndStored} href={`${base}/billing`} detail={percent(f.billing.billedPctOfContract)} />
          <MoneyKpi label="Collected" amount={f.billing.amountCollected} />
          <MoneyKpi label="Accounts receivable" amount={f.billing.accountsReceivable} tone={f.billing.accountsReceivable > 0 ? 'caution' : 'neutral'} />
          <MoneyKpi label="Retention receivable" amount={f.retentionReceivable} />
          <MoneyKpi
            label={f.revenue.overbilled > 0 ? 'Overbilled' : 'Underbilled'}
            amount={f.revenue.overbilled > 0 ? f.revenue.overbilled : f.revenue.underbilled}
            tone={f.revenue.underbilled > 0 ? 'caution' : 'favorable'}
            hint="Amount billed compared with revenue earned at the current percent complete."
          />
          <MoneyKpi label="Backlog" amount={f.backlog} detail="Contract still to bill" />
        </KpiGrid>
      </Section>

      {/* ── Charts ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartFrame
          title="Cost, billing and cash curve"
          subtitle="Actuals to the data date, forecast beyond it"
          className="xl:col-span-2"
        >
          <LineChart
            labels={cashFlow.map((r) => month(r.periodEnd))}
            height={280}
            format="moneyShort"
            forecastFromIndex={dataDateIndex >= 0 ? dataDateIndex : undefined}
            series={[
              { key: 'plannedValue', label: 'Planned value', values: cashFlow.map((r) => r.plannedValue), color: 'var(--ink-400)', dashed: true },
              { key: 'cumCost', label: 'Cumulative cost', values: cashFlow.map((r) => r.cumulativeCost), color: 'var(--adverse)' },
              { key: 'cumBillings', label: 'Cumulative billings', values: cashFlow.map((r) => r.cumulativeBillings), color: 'var(--accent)', area: true },
              { key: 'cumCash', label: 'Cumulative cash', values: cashFlow.map((r) => r.cumulativeCash), color: 'var(--favorable)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Budget by category" subtitle="Current budget against forecast at completion">
          <DonutChart
            format="moneyShort"
            centerLabel="Current budget"
            centerValue={moneyShort(f.currentBudget)}
            slices={f.categories.map((c) => ({ label: CATEGORY_LABELS[c.category], value: c.currentBudget }))}
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame title="Budget vs cost vs forecast by trade" subtitle="Click through to the budget for line detail">
          <HorizontalBars
            labels={byTrade.map((t) => t.label)}
            format="moneyShort"
            series={[
              { key: 'budget', label: 'Current budget', values: byTrade.map((t) => t.currentBudget) },
              { key: 'cost', label: 'Cost to date', values: byTrade.map((t) => t.costToDate), color: 'var(--caution)' },
              { key: 'forecast', label: 'Forecast', values: byTrade.map((t) => t.forecastAtCompletion), color: 'var(--adverse)' },
            ]}
          />
        </ChartFrame>

        <div className="space-y-4">
          <ChartFrame title="Earned value" subtitle="Performance indices at the data date">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <DataList
                columns={1}
                items={[
                  { label: 'Budget at completion', value: money(f.earnedValue.budgetAtCompletion) },
                  { label: 'Planned value', value: money(f.earnedValue.plannedValue) },
                  { label: 'Earned value', value: money(f.earnedValue.earnedValue) },
                  { label: 'Actual cost', value: money(f.earnedValue.actualCost) },
                ]}
              />
              <DataList
                columns={1}
                items={[
                  {
                    label: 'Cost performance index',
                    value: (
                      <span style={{ color: f.earnedValue.costPerformanceIndex >= 1 ? 'var(--favorable)' : 'var(--adverse)' }}>
                        {f.earnedValue.costPerformanceIndex.toFixed(3)}
                      </span>
                    ),
                    hint: 'Earned value ÷ actual cost. Below 1 means the work costs more than budgeted.',
                  },
                  {
                    label: 'Schedule performance index',
                    value: (
                      <span style={{ color: f.earnedValue.schedulePerformanceIndex >= 1 ? 'var(--favorable)' : 'var(--adverse)' }}>
                        {f.earnedValue.schedulePerformanceIndex.toFixed(3)}
                      </span>
                    ),
                    hint: 'Earned value ÷ planned value. Below 1 means progress is behind the plan.',
                  },
                  { label: 'Cost variance', value: <Variance value={f.earnedValue.costVariance} /> },
                  { label: 'Schedule variance', value: <Variance value={f.earnedValue.scheduleVariance} /> },
                ]}
              />
            </div>
          </ChartFrame>

          <ChartFrame
            title="Estimate at completion"
            subtitle="All three methods, so the selection can be justified"
            action={
              <Link href={`${base}/forecast`} className="btn btn-ghost text-xs">
                Reforecast →
              </Link>
            }
          >
            <DataList
              columns={1}
              items={[
                {
                  label: 'Bottom-up (line forecasts)',
                  value: (
                    <span style={{ fontWeight: f.eac.method === 'BOTTOM_UP' ? 600 : 400 }}>
                      {money(f.eac.bottomUp)}
                      {f.eac.method === 'BOTTOM_UP' && ' ✓'}
                    </span>
                  ),
                },
                {
                  label: 'Performance (BAC ÷ CPI)',
                  value: (
                    <span style={{ fontWeight: f.eac.method === 'CPI_BASED' ? 600 : 400 }}>
                      {money(f.eac.cpiBased)}
                      {f.eac.method === 'CPI_BASED' && ' ✓'}
                    </span>
                  ),
                },
                {
                  label: 'Budget rate (AC + BAC − EV)',
                  value: (
                    <span style={{ fontWeight: f.eac.method === 'BUDGET_RATE' ? 600 : 400 }}>
                      {money(f.eac.budgetRate)}
                      {f.eac.method === 'BUDGET_RATE' && ' ✓'}
                    </span>
                  ),
                },
                { label: 'Variance at completion', value: <Variance value={f.eac.varianceAtCompletion} /> },
              ]}
            />
          </ChartFrame>
        </div>
      </div>

      {/* ── Project facts ─────────────────────────────────────────────── */}
      <Section title="Project detail">
        <div className="card grid grid-cols-1 gap-x-8 gap-y-1 p-4 lg:grid-cols-3">
          <DataList
            columns={1}
            items={[
              { label: 'Client', value: project.client?.name ?? '—' },
              { label: 'Project type', value: project.projectType ?? '—' },
              { label: 'Delivery method', value: project.deliveryMethod ?? '—' },
              { label: 'Architect', value: project.architect ?? '—' },
              { label: 'Superintendent', value: project.superintendent ?? '—' },
            ]}
          />
          <DataList
            columns={1}
            items={[
              { label: 'Notice to proceed', value: date(project.noticeToProceed) },
              { label: 'Contract start', value: date(project.contractStart) },
              { label: 'Contract completion', value: date(project.contractCompletion) },
              { label: 'Forecast completion', value: date(project.forecastCompletion) },
              {
                label: 'Schedule position',
                value:
                  f.health.daysAheadBehind == null ? (
                    '—'
                  ) : (
                    <span style={{ color: f.health.daysAheadBehind < 0 ? 'var(--adverse)' : 'var(--favorable)' }}>
                      {days(f.health.daysAheadBehind)}
                    </span>
                  ),
              },
            ]}
          />
          <DataList
            columns={1}
            items={[
              { label: 'Owner retention', value: percent(project.ownerRetentionPct, 1) },
              { label: 'Sub retention (default)', value: percent(project.defaultSubRetentionPct, 1) },
              { label: 'Target margin', value: percent(project.targetMarginPct, 1) },
              { label: 'EAC method', value: titleize(project.eacMethod) },
              { label: 'Percent-complete method', value: titleize(project.pocMethod) },
            ]}
          />
        </div>
      </Section>
    </div>
  )
}
