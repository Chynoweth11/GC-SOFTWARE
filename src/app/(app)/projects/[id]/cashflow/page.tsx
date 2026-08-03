import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { sumBy } from '@/lib/finance'
import { date, money, moneyShort, month, percent } from '@/lib/format'
import { KpiGrid, MoneyKpi, Section, InfoNote } from '@/components/ui'
import { ChartFrame, BarChart, LineChart } from '@/components/charts/primitives'
import { CashFlowEditor } from '@/components/project/cash-flow-editor'
import { saveCashFlowPeriod, regenerateCurve } from './actions'

export default async function CashFlowPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, cashFlow, scenarios } = bundle
  const canEdit = can(user.role, 'edit:forecast')

  const forecastFrom = cashFlow.findIndex((r) => !r.isActual)
  const labels = cashFlow.map((r) => month(r.periodEnd))

  const lowPoint = cashFlow.reduce((worst, r) => (r.netCash < worst.netCash ? r : worst), cashFlow[0])
  const finalPosition = cashFlow.at(-1)
  const peakFunding = Math.min(0, ...cashFlow.map((r) => r.netCash))

  const remainingCollections = sumBy(
    cashFlow.filter((r) => !r.isActual),
    (r) => r.cashIn,
  )
  const remainingOutflow = sumBy(
    cashFlow.filter((r) => !r.isActual),
    (r) => r.totalCost,
  )

  return (
    <div className="space-y-6">
      <Section title="Cash position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Collected to date" amount={f.billing.amountCollected} />
          <MoneyKpi label="Cost spent to date" amount={f.totalCostToDate} />
          <MoneyKpi
            label="Net cash today"
            amount={f.billing.amountCollected - f.totalCostToDate}
            tone={f.billing.amountCollected - f.totalCostToDate < 0 ? 'adverse' : 'favorable'}
          />
          <MoneyKpi
            label="Peak funding requirement"
            amount={peakFunding}
            tone={peakFunding < 0 ? 'caution' : 'neutral'}
            hint="The deepest the project's cash position goes across the whole job — the working capital it needs."
          />
          <MoneyKpi label="Collections still to come" amount={remainingCollections} />
          <MoneyKpi
            label="Projected final cash"
            amount={finalPosition?.netCash ?? 0}
            tone={(finalPosition?.netCash ?? 0) < 0 ? 'adverse' : 'favorable'}
          />
        </KpiGrid>
      </Section>

      {peakFunding < 0 && lowPoint && (
        <InfoNote>
          This project is forecast to be cash-negative at its deepest point, {money(Math.abs(peakFunding))} out of pocket around{' '}
          {date(lowPoint.periodEnd)}. It needs that much working capital before collections catch up with spend.
        </InfoNote>
      )}

      <ChartFrame title="Cash flow" subtitle="Cost, billings and collections by month, actuals then forecast">
        <LineChart
          labels={labels}
          height={300}
          format="moneyShort"
          forecastFromIndex={forecastFrom >= 0 ? forecastFrom : undefined}
          series={[
            { key: 'cumCost', label: 'Cumulative cost', values: cashFlow.map((r) => r.cumulativeCost), color: 'var(--adverse)' },
            { key: 'cumBillings', label: 'Cumulative billings', values: cashFlow.map((r) => r.cumulativeBillings), color: 'var(--accent)' },
            { key: 'cumCash', label: 'Cumulative collections', values: cashFlow.map((r) => r.cumulativeCash), color: 'var(--favorable)', area: true },
            { key: 'net', label: 'Net cash position', values: cashFlow.map((r) => r.netCash), color: 'var(--caution)', dashed: true },
          ]}
        />
      </ChartFrame>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Monthly flows" subtitle="What comes in and what goes out each month">
          <BarChart
            labels={labels}
            height={250}
            format="moneyShort"
            series={[
              { key: 'in', label: 'Collections', values: cashFlow.map((r) => r.cashIn), color: 'var(--favorable)' },
              { key: 'out', label: 'Cost outflow', values: cashFlow.map((r) => -r.totalCost), color: 'var(--adverse)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Scenarios" subtitle="Best case collects a month sooner at 3% under; worst lags a month at 8% over">
          <LineChart
            labels={labels}
            height={250}
            format="moneyShort"
            forecastFromIndex={forecastFrom >= 0 ? forecastFrom : undefined}
            series={[
              { key: 'best', label: 'Best case', values: scenarios.best.map((r) => r.netCash), color: 'var(--favorable)' },
              { key: 'expected', label: 'Expected', values: scenarios.expected.map((r) => r.netCash), color: 'var(--accent)' },
              { key: 'worst', label: 'Worst case', values: scenarios.worst.map((r) => r.netCash), color: 'var(--adverse)' },
            ]}
          />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {(
              [
                ['Best', scenarios.best.at(-1)?.netCash ?? 0, 'favorable'],
                ['Expected', scenarios.expected.at(-1)?.netCash ?? 0, 'accent'],
                ['Worst', scenarios.worst.at(-1)?.netCash ?? 0, 'adverse'],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="rounded-lg p-2" style={{ background: 'var(--surface-inset)' }}>
                <div style={{ color: 'var(--text-subtle)' }}>{label} final cash</div>
                <div className="tnum font-semibold" style={{ color: `var(--${tone})` }}>
                  {moneyShort(value)}
                </div>
              </div>
            ))}
          </div>
        </ChartFrame>
      </div>

      <Section
        title="Monthly detail"
        description="Planned progress drives the forecast spread. Override a month's billing or collection where the plan is known to differ."
        actions={
          canEdit ? (
            <form action={regenerateCurve}>
              <input type="hidden" name="projectId" value={project.id} />
              <button type="submit" className="btn btn-secondary text-xs">
                Rebuild curve from dates
              </button>
            </form>
          ) : undefined
        }
      >
        <CashFlowEditor
          projectId={project.id}
          rows={cashFlow.map((r) => ({
            periodEnd: r.periodEnd.toISOString(),
            isActual: r.isActual,
            plannedDeltaPct: r.plannedDeltaPct,
            plannedCumPct: r.plannedCumPct,
            plannedValue: r.plannedValue,
            actualPctComplete: r.actualPctComplete,
            earnedValue: r.earnedValue,
            actualCost: r.actualCost,
            forecastCost: r.forecastCost,
            totalCost: r.totalCost,
            cumulativeCost: r.cumulativeCost,
            billings: r.billings,
            cumulativeBillings: r.cumulativeBillings,
            cashIn: r.cashIn,
            cumulativeCash: r.cumulativeCash,
            scheduleVariance: r.scheduleVariance,
            overUnderBilled: r.overUnderBilled,
            netCash: r.netCash,
          }))}
          canEdit={canEdit}
          save={saveCashFlowPeriod}
        />
      </Section>

      <Section title="Cash requirements">
        <div className="card p-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <div className="label mb-1">Expected subcontractor payments</div>
              <div className="tnum text-lg font-semibold">{money(f.subcontracts.outstanding)}</div>
              <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                Approved and unpaid today
              </div>
            </div>
            <div>
              <div className="label mb-1">Retention payable at closeout</div>
              <div className="tnum text-lg font-semibold">{money(f.retentionPayable)}</div>
              <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                Released to subs at completion
              </div>
            </div>
            <div>
              <div className="label mb-1">Retention receivable</div>
              <div className="tnum text-lg font-semibold">{money(f.retentionReceivable)}</div>
              <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                Held by the owner, due at closeout
              </div>
            </div>
            <div>
              <div className="label mb-1">Remaining cost outflow</div>
              <div className="tnum text-lg font-semibold">{money(remainingOutflow)}</div>
              <div className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                Cost still to be spent
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Collections are modelled a month behind billing, net of {percent(project.ownerRetentionPct, 1)} retention, with the retention
            released the month after forecast completion.
          </p>
        </div>
      </Section>
    </div>
  )
}
