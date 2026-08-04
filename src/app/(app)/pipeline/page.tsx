import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { followUpState, rollupPipeline, type PipelineRow } from '@/lib/finance'
import { date, money, moneyShort, percent, titleize } from '@/lib/format'
import { EmptyState, KpiGrid, Kpi, MoneyKpi, PageHeader, Section, StatusPill, Pill } from '@/components/ui'
import { ChartFrame, DonutChart, HorizontalBars } from '@/components/charts/primitives'
import { BidForm } from '@/components/pipeline/bid-form'
import { createBid, updateBidStatus, logTouch } from './actions'

export const metadata = { title: 'Bid pipeline' }

const FOLLOW_UP_TONE: Record<string, 'adverse' | 'caution' | 'accent' | 'neutral' | 'favorable'> = {
  OVERDUE: 'adverse',
  TODAY: 'caution',
  'THIS WEEK': 'caution',
  SCHEDULED: 'accent',
  'SET ONE': 'caution',
  CLOSED: 'neutral',
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ followUp?: string; status?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams
  const canEdit = can(user.role, 'edit:pipeline')

  const [bids, clients] = await Promise.all([
    prisma.bid.findMany({ where: { companyId: user.companyId }, include: { client: true }, orderBy: [{ bidDue: 'asc' }] }),
    prisma.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } }),
  ])

  const asOf = new Date('2026-08-03T00:00:00.000Z')

  const rows: PipelineRow[] = bids.map((b) => ({
    id: b.id,
    number: b.number,
    name: b.name,
    clientName: b.client?.name ?? b.clientContact,
    status: b.status,
    estimatedValue: b.estimatedValue,
    submittedAmount: b.submittedAmount,
    winProbability: b.winProbability,
    bidDue: b.bidDue,
    nextFollowUp: b.nextFollowUp,
    decisionDate: b.decisionDate,
    estimator: b.estimator,
    clientType: b.clientType,
    leadSource: b.leadSource,
  }))

  const summary = rollupPipeline(rows, asOf)

  let visible = rows
  if (params.followUp === 'overdue') visible = visible.filter((r) => followUpState(r, asOf) === 'OVERDUE')
  if (params.status) visible = visible.filter((r) => r.status === params.status)

  const bySource = new Map<string, number>()
  for (const r of rows) {
    const key = r.leadSource ?? 'Unknown'
    bySource.set(key, (bySource.get(key) ?? 0) + (r.submittedAmount || r.estimatedValue))
  }
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1])

  return (
    <>
      <PageHeader
        title="Bid pipeline"
        subtitle={`${summary.activeBids} active opportunities · ${moneyShort(summary.openPipelineValue)} open · ${moneyShort(summary.weightedPipeline)} weighted`}
        actions={
          params.followUp || params.status ? (
            <Link href="/pipeline" className="btn btn-secondary">
              Clear filters
            </Link>
          ) : undefined
        }
      />

      <Section className="mb-5">
        <KpiGrid cols={6}>
          <Kpi label="Active bids" value={summary.activeBids.toString()} detail={`${summary.bidsDueNext14Days} due in 14 days`} />
          <MoneyKpi label="Open pipeline" amount={summary.openPipelineValue} />
          <MoneyKpi label="Weighted pipeline" amount={summary.weightedPipeline} hint="Value × probability across every open opportunity." />
          <Kpi
            label="Win rate"
            value={percent(summary.winRateByCount, 0)}
            detail={`${percent(summary.winRateByValue, 0)} by value`}
            tone={summary.winRateByCount >= 0.4 ? 'favorable' : 'caution'}
          />
          <MoneyKpi label="Won year to date" amount={summary.wonYtdValue} detail={`${summary.wonYtdCount} jobs`} tone="favorable" />
          <Kpi
            label="Follow-ups overdue"
            value={summary.followUpsOverdue.toString()}
            tone={summary.followUpsOverdue > 0 ? 'adverse' : 'favorable'}
            detail={`${summary.followUpsDueThisWeek} due this week`}
            href="/pipeline?followUp=overdue"
          />
        </KpiGrid>
      </Section>

      {summary.followUpsOverdue > 0 && (
        <div
          className="mb-5 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
        >
          {summary.followUpsOverdue} follow-up{summary.followUpsOverdue === 1 ? ' is' : 's are'} past due. Opportunities go cold quietly.
          these are the ones to call today.
        </div>
      )}

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartFrame title="Pipeline by stage" className="lg:col-span-2">
          <HorizontalBars
            labels={summary.byStatus.map((s) => titleize(s.status))}
            format="moneyShort"
            series={[
              { key: 'value', label: 'Value', values: summary.byStatus.map((s) => s.value) },
              { key: 'weighted', label: 'Weighted', values: summary.byStatus.map((s) => s.weighted), color: 'var(--favorable)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Where the work comes from" subtitle="Opportunity value by lead source">
          <DonutChart
            format="moneyShort"
            centerLabel="Total raised"
            centerValue={moneyShort(sourceRows.reduce((a, [, v]) => a + v, 0))}
            slices={sourceRows.map(([label, value]) => ({ label, value }))}
          />
        </ChartFrame>
      </div>

      <Section title="Opportunities" description="The follow-up column is the engine: it turns red the day a follow-up goes past due">
        {visible.length === 0 ? (
          <EmptyState title="No opportunities match" description="Clear the filters to see the whole pipeline." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Bid</th>
                    <th>Opportunity</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Estimator</th>
                    <th>Due</th>
                    <th className="num">Days to due</th>
                    <th className="num">Est. value</th>
                    <th className="num">Submitted</th>
                    <th className="num">Win prob</th>
                    <th className="num">Weighted</th>
                    <th>Status</th>
                    <th>Next follow-up</th>
                    <th>Follow-up</th>
                    <th className="num">Touches</th>
                    <th>Next action</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const record = bids.find((b) => b.id === r.id)!
                    const state = followUpState(r, asOf)
                    const daysToDue = r.bidDue ? Math.round((r.bidDue.getTime() - asOf.getTime()) / 86_400_000) : null
                    const value = r.submittedAmount || r.estimatedValue
                    return (
                      <tr key={r.id} style={state === 'OVERDUE' ? { background: 'color-mix(in oklab, var(--adverse) 5%, transparent)' } : undefined}>
                        <td className="font-medium">{r.number}</td>
                        <td className="max-w-[16rem] truncate" title={r.name}>
                          {r.name}
                        </td>
                        <td className="max-w-[12rem] truncate" style={{ color: 'var(--text-muted)' }}>
                          {r.clientName ?? '-'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{titleize(r.clientType)}</td>
                        <td className="max-w-[10rem] truncate" style={{ color: 'var(--text-subtle)' }}>
                          {r.leadSource ?? '-'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{r.estimator ?? '-'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(r.bidDue)}</td>
                        <td className="num" style={{ color: daysToDue != null && daysToDue < 0 ? 'var(--adverse)' : undefined }}>
                          {state === 'CLOSED' || daysToDue == null ? '-' : daysToDue}
                        </td>
                        <td className="num">{money(r.estimatedValue)}</td>
                        <td className="num">{money(r.submittedAmount)}</td>
                        <td className="num">{percent(r.winProbability, 0)}</td>
                        <td className="num">{money(value * r.winProbability)}</td>
                        <td>
                          <StatusPill status={r.status} />
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(r.nextFollowUp)}</td>
                        <td>
                          <Pill tone={FOLLOW_UP_TONE[state]} dot={state !== 'CLOSED'}>
                            {state === 'CLOSED' ? '-' : state}
                          </Pill>
                        </td>
                        <td className="num">{record.touches}</td>
                        <td className="max-w-[18rem] truncate" title={record.nextAction ?? ''} style={{ color: 'var(--text-muted)' }}>
                          {record.nextAction ?? '-'}
                        </td>
                        {canEdit && (
                          <td className="no-print">
                            <div className="flex items-center gap-1">
                              <form action={logTouch}>
                                <input type="hidden" name="bidId" value={r.id} />
                                <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]" title="Log a contact and push the follow-up out a week">
                                  Touch
                                </button>
                              </form>
                              <form action={updateBidStatus} className="flex items-center gap-1">
                                <input type="hidden" name="bidId" value={r.id} />
                                <select name="status" defaultValue={r.status} className="field w-auto py-0.5 text-[11px]" aria-label={`Status for ${r.number}`}>
                                  {['LEAD', 'QUALIFYING', 'ESTIMATING', 'SUBMITTED', 'PENDING_DECISION', 'ON_HOLD', 'WON', 'LOST', 'NO_BID', 'WITHDRAWN'].map((s) => (
                                    <option key={s} value={s}>
                                      {titleize(s)}
                                    </option>
                                  ))}
                                </select>
                                <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                                  Set
                                </button>
                              </form>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8}>Total, {visible.length} opportunities</td>
                    <td className="num">{money(visible.reduce((a, r) => a + r.estimatedValue, 0))}</td>
                    <td className="num">{money(visible.reduce((a, r) => a + r.submittedAmount, 0))}</td>
                    <td />
                    <td className="num">{money(visible.reduce((a, r) => a + (r.submittedAmount || r.estimatedValue) * r.winProbability, 0))}</td>
                    <td colSpan={canEdit ? 6 : 5} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      {canEdit && (
        <Section title="Add an opportunity" className="mt-6">
          <BidForm clients={clients.map((c) => ({ id: c.id, label: c.name }))} action={createBid} />
        </Section>
      )}
    </>
  )
}
