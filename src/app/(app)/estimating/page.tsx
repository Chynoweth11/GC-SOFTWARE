import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { listEstimates } from '@/lib/queries/estimate'
import { date, money, moneyShort, percent, titleize } from '@/lib/format'
import { EmptyState, KpiGrid, Kpi, MoneyKpi, PageHeader, Section, StatusPill, Pill } from '@/components/ui'
import { ChartFrame, HorizontalBars } from '@/components/charts/primitives'

export const metadata = { title: 'Estimating' }

export default async function EstimatingPage() {
  const user = await requireUser()
  const estimates = await listEstimates(user.companyId)
  const canEdit = can(user.role, 'edit:estimates')

  const active = estimates.filter((e) => !['ARCHIVED', 'LOST'].includes(e.status))
  const totalBid = active.reduce((a, e) => a + e.totalBid, 0)
  const withIssues = estimates.filter((e) => e.qaIssues > 0)

  return (
    <>
      <PageHeader
        title="Estimating"
        subtitle={`${estimates.length} estimate${estimates.length === 1 ? '' : 's'} · ${moneyShort(totalBid)} of active bid value`}
        actions={
          canEdit ? (
            <Link href="/estimating/new" className="btn btn-primary">
              New estimate
            </Link>
          ) : undefined
        }
      />

      {estimates.length === 0 ? (
        <EmptyState
          title="No estimates yet"
          description="Start an estimate to build a takeoff, price general conditions, level subcontractor quotes and produce a bid."
          action={
            canEdit ? (
              <Link href="/estimating/new" className="btn btn-primary">
                Create the first estimate
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <Section className="mb-5">
            <KpiGrid cols={4}>
              <Kpi label="Active estimates" value={active.length.toString()} />
              <MoneyKpi label="Total bid value" amount={totalBid} />
              <Kpi
                label="Average margin"
                value={percent(active.length ? active.reduce((a, e) => a + e.margin, 0) / active.length : 0)}
              />
              <Kpi
                label="Estimates with open QA issues"
                value={withIssues.length.toString()}
                tone={withIssues.length > 0 ? 'caution' : 'favorable'}
              />
            </KpiGrid>
          </Section>

          <ChartFrame title="Bid value by estimate" subtitle="Direct cost against the final bid" className="mb-5">
            <HorizontalBars
              labels={estimates.map((e) => e.name)}
              format="moneyShort"
              series={[
                { key: 'bid', label: 'Total bid', values: estimates.map((e) => e.totalBid) },
                { key: 'direct', label: 'Direct cost', values: estimates.map((e) => e.directCost), color: 'var(--caution)' },
              ]}
            />
          </ChartFrame>

          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Estimate</th>
                    <th>Version</th>
                    <th>Client</th>
                    <th>Bid</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Estimator</th>
                    <th className="num">Takeoff lines</th>
                    <th className="num">Direct cost</th>
                    <th className="num">Total bid</th>
                    <th className="num">Margin</th>
                    <th>QA</th>
                    <th>Converted</th>
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/estimating/${e.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                          {e.name}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>v{e.version}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.clientName ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.bid?.number ?? '—'}</td>
                      <td>
                        <StatusPill status={e.status} />
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(e.bidDueDate)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.estimator ?? '—'}</td>
                      <td className="num">{e._count.items}</td>
                      <td className="num">{money(e.directCost)}</td>
                      <td className="num font-medium">{money(e.totalBid)}</td>
                      <td className="num">{percent(e.margin)}</td>
                      <td>
                        {e.qaIssues === 0 ? (
                          <Pill tone="favorable">Clear</Pill>
                        ) : (
                          <Pill tone="caution">
                            {e.qaIssues} issue{e.qaIssues === 1 ? '' : 's'}
                          </Pill>
                        )}
                      </td>
                      <td>
                        {e.projects.length > 0 ? (
                          <Link href={`/projects/${e.projects[0].id}`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                            {e.projects[0].number}
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}
