import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { money, percent } from '@/lib/format'
import { EmptyState, KpiGrid, Kpi, MoneyKpi, Section, Pill, InfoNote } from '@/components/ui'
import { ChartFrame, HorizontalBars } from '@/components/charts/primitives'
import { GcForm } from '@/components/estimating/gc-form'
import { saveGcItem } from '../actions'

export default async function GcPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) notFound()

  const { estimate, summary } = bundle
  const canEdit = can(user.role, 'edit:estimates') && !estimate.lockedAt
  const unpriced = summary.gcItems.filter((g) => g.item && g.total === 0)

  return (
    <div className="space-y-6">
      <Section title="General conditions">
        <KpiGrid cols={4}>
          <MoneyKpi label="General conditions total" amount={summary.gcTotal} detail={`${summary.gcItems.length} items`} />
          <Kpi label="Project duration" value={`${estimate.durationWeeks} weeks`} detail="Weekly items requantify with it" />
          <Kpi label="Share of direct cost" value={percent(summary.directCost ? summary.gcTotal / summary.directCost : 0)} />
          <Kpi
            label="Unpriced items"
            value={unpriced.length.toString()}
            tone={unpriced.length > 0 ? 'caution' : 'favorable'}
          />
        </KpiGrid>
      </Section>

      <InfoNote>
        Items marked as duration-driven requantify automatically when the project duration changes on the setup tab: change 22 weeks to
        26 and every weekly line reprices.
      </InfoNote>

      <ChartFrame title="General conditions by item">
        <HorizontalBars
          labels={summary.gcItems.filter((g) => g.total > 0).map((g) => g.item)}
          format="moneyShort"
          maxRows={20}
          series={[{ key: 'total', label: 'Amount', values: summary.gcItems.filter((g) => g.total > 0).map((g) => g.total) }]}
        />
      </ChartFrame>

      <Section title="Priced items">
        {summary.gcItems.length === 0 ? (
          <EmptyState title="No general-conditions items yet" description="Add the time-driven site costs below." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Basis</th>
                    <th className="num">Quantity</th>
                    <th className="num">Unit cost</th>
                    <th className="num">Total</th>
                    <th>Notes</th>
                    <th>Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.gcItems.map((g) => (
                    <tr key={g.id} style={g.total === 0 ? { background: 'color-mix(in oklab, var(--caution) 6%, transparent)' } : undefined}>
                      <td className="font-medium">{g.item}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{g.basis}</td>
                      <td className="num">{g.qty}</td>
                      <td className="num">{money(g.unitCost)}</td>
                      <td className="num font-medium">{money(g.total)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{g.notes ?? '-'}</td>
                      <td>{g.followsDuration ? <Pill tone="accent">Follows duration</Pill> : <Pill tone="neutral">Fixed</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total</td>
                    <td className="num">{money(summary.gcTotal)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      {canEdit && (
        <Section title="Add or update an item">
          <GcForm
            estimateId={estimate.id}
            durationWeeks={estimate.durationWeeks}
            items={summary.gcItems.map((g) => ({ id: g.id, label: g.item }))}
            action={saveGcItem}
          />
        </Section>
      )}
    </div>
  )
}
