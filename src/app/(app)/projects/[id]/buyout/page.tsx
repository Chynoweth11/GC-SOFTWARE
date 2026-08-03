import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { levelingSummary } from '@/lib/finance'
import { money, moneyShort, percent } from '@/lib/format'
import { EmptyState, KpiGrid, MoneyKpi, Kpi, Section } from '@/components/ui'
import { ChartFrame, HorizontalBars } from '@/components/charts/primitives'
import { LevelingBoard } from '@/components/estimating/leveling-board'
import { awardPackage } from './actions'

export default async function BuyoutPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, bidPackages } = bundle
  const canEdit = can(user.role, 'edit:commitments')
  const summary = levelingSummary(bidPackages)

  if (bidPackages.length === 0) {
    return (
      <EmptyState
        title="No buyout packages on this project"
        description="Buyout packages carry over automatically when a bid is converted to a project, or can be added from the estimate."
      />
    )
  }

  const awarded = bidPackages.filter((p) => p.awardAmount > 0)

  return (
    <div className="space-y-6">
      <Section title="Buyout position">
        <KpiGrid cols={5}>
          <MoneyKpi label="Budget across packages" amount={summary.totalBudget} detail={`${summary.packageCount} packages`} />
          <MoneyKpi label="Awarded value" amount={summary.totalAwarded} detail={`${summary.awardedCount} bought out`} />
          <MoneyKpi
            label="Buyout savings"
            amount={summary.buyoutSavings}
            tone={summary.buyoutSavings >= 0 ? 'favorable' : 'adverse'}
            detail={percent(summary.buyoutSavingsPct)}
            hint="Budget less the value actually contracted, on packages that have been awarded."
          />
          <Kpi label="Still to buy out" value={summary.openCount.toString()} detail={`${moneyShort(summary.totalBudget - summary.totalAwarded)} of budget open`} />
          <Kpi
            label="Packages with exceptions"
            value={summary.packagesWithFlags.toString()}
            tone={summary.packagesWithFlags > 0 ? 'caution' : 'favorable'}
            detail={`${summary.quotesPending} quotes still pending`}
          />
        </KpiGrid>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Budget vs low bid vs award" subtitle="Where each package landed against what was carried">
          <HorizontalBars
            labels={bidPackages.map((p) => p.name)}
            format="moneyShort"
            series={[
              { key: 'budget', label: 'Budget', values: bidPackages.map((p) => p.budgetAmount) },
              { key: 'low', label: 'Low leveled bid', values: bidPackages.map((p) => p.lowLeveled), color: 'var(--caution)' },
              { key: 'award', label: 'Awarded', values: bidPackages.map((p) => p.awardAmount), color: 'var(--favorable)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Savings by package" subtitle="Positive is money kept against budget">
          <HorizontalBars
            labels={awarded.map((p) => p.name)}
            format="moneyShort"
            series={[{ key: 'savings', label: 'Buyout savings', values: awarded.map((p) => p.buyoutSavings) }]}
          />
        </ChartFrame>
      </div>

      <Section
        title="Bid leveling"
        description="Compare leveled bids, not raw ones. Scope gaps, exclusions and wide spreads are flagged automatically."
      >
        <LevelingBoard packages={bidPackages} canEdit={canEdit} award={awardPackage} contextId={project.id} contextType="project" />
      </Section>
    </div>
  )
}
