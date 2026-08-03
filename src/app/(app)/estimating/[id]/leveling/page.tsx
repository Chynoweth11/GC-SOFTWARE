import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { money } from '@/lib/format'
import { EmptyState, KpiGrid, Kpi, MoneyKpi, Section } from '@/components/ui'
import { ChartFrame, HorizontalBars } from '@/components/charts/primitives'
import { LevelingBoard } from '@/components/estimating/leveling-board'
import { awardPackage } from '@/app/(app)/projects/[id]/buyout/actions'

export default async function LevelingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) notFound()

  const { estimate, packages, levelingSummary: summary } = bundle
  const canEdit = can(user.role, 'edit:estimates') && !estimate.lockedAt

  if (packages.length === 0) {
    return (
      <EmptyState
        title="No subcontractor packages on this estimate"
        description="Add packages to compare quotes side by side, level scope gaps and carry the right number into the bid."
      />
    )
  }

  const variance = packages.filter((p) => p.awardAmount > 0 && Math.abs(p.awardAmount - p.carriedAmount) > 0.005)

  return (
    <div className="space-y-6">
      <Section title="Quote position">
        <KpiGrid cols={5}>
          <Kpi label="Packages" value={summary.packageCount.toString()} detail={`${summary.awardedCount} selected`} />
          <MoneyKpi label="Carried in the takeoff" amount={packages.reduce((a, p) => a + p.carriedAmount, 0)} />
          <MoneyKpi label="Low leveled bids" amount={summary.totalLow} />
          <MoneyKpi
            label="Selected vs carried"
            amount={packages.reduce((a, p) => a + (p.awardAmount > 0 ? p.awardAmount - p.carriedAmount : 0), 0)}
            tone={variance.length > 0 ? 'caution' : 'favorable'}
            detail={variance.length > 0 ? `${variance.length} package${variance.length === 1 ? '' : 's'} differ` : 'All tied'}
          />
          <Kpi
            label="Quotes still pending"
            value={summary.quotesPending.toString()}
            tone={summary.quotesPending > 0 ? 'caution' : 'favorable'}
          />
        </KpiGrid>
      </Section>

      {variance.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
        >
          The selected quote differs from the amount carried in the takeoff on{' '}
          {variance.map((p) => `${p.name} (${money(p.awardAmount - p.carriedAmount)})`).join(', ')}. Update the takeoff line so the bid
          reflects the real number.
        </div>
      )}

      <ChartFrame title="Leveled bids against the amount carried">
        <HorizontalBars
          labels={packages.map((p) => p.name)}
          format="moneyShort"
          series={[
            { key: 'carried', label: 'Carried in takeoff', values: packages.map((p) => p.carriedAmount) },
            { key: 'low', label: 'Low leveled bid', values: packages.map((p) => p.lowLeveled), color: 'var(--caution)' },
            { key: 'selected', label: 'Selected', values: packages.map((p) => p.awardAmount), color: 'var(--favorable)' },
          ]}
        />
      </ChartFrame>

      <Section
        title="Bid leveling"
        description="Level scope gaps in the adjustment column and compare leveled numbers, never raw ones."
      >
        <LevelingBoard packages={packages} canEdit={canEdit} award={awardPackage} contextId={estimate.id} contextType="estimate" />
      </Section>
    </div>
  )
}
