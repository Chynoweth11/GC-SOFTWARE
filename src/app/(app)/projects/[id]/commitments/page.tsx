import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import { sumBy } from '@/lib/finance'
import { date, money, moneyShort, percent } from '@/lib/format'
import { EmptyState, KpiGrid, MoneyKpi, Section, StatusPill, Variance } from '@/components/ui'
import { ChartFrame, HorizontalBars, Meter } from '@/components/charts/primitives'
import { CommitmentForm } from '@/components/project/commitment-form'
import { createCommitment, addCommitmentChange } from './actions'

export default async function CommitmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, commitments, commitmentRecords } = bundle
  const canEdit = can(user.role, 'edit:commitments')

  const [vendors, costCodes] = await Promise.all([
    prisma.vendor.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } }),
    prisma.budgetLine.findMany({ where: { projectId: id }, orderBy: [{ category: 'asc' }, { description: 'asc' }] }),
  ])

  const recordById = new Map(commitmentRecords.map((c) => [c.id, c]))
  const subcontracts = commitments.filter((c) => c.type === 'SUBCONTRACT')
  const purchaseOrders = commitments.filter((c) => c.type !== 'SUBCONTRACT')

  const overCommitted = f.lines.filter((l) => l.currentBudget > 0 && l.committed > l.currentBudget + 0.005)

  const renderTable = (rows: typeof commitments, title: string, description: string) => {
    if (rows.length === 0) {
      return (
        <Section title={title} description={description}>
          <EmptyState title={`No ${title.toLowerCase()} yet`} description="Add one below and it will post against the budget and forecast immediately." />
        </Section>
      )
    }
    return (
      <Section title={title} description={description}>
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Vendor</th>
                  <th>Scope</th>
                  <th>Line items</th>
                  <th>Status</th>
                  <th className="num">Original</th>
                  <th className="num">Approved changes</th>
                  <th className="num">Pending</th>
                  <th className="num">Current value</th>
                  <th style={{ minWidth: 100 }}>% complete</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Paid</th>
                  <th className="num">Retention</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Balance to complete</th>
                  <th className="num">Forecast final</th>
                  <th className="num">Buyout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const record = recordById.get(c.id)
                  return (
                    <tr key={c.id} style={c.overrunRisk > 0 ? { background: 'color-mix(in oklab, var(--adverse) 5%, transparent)' } : undefined}>
                      <td className="font-medium">{c.number}</td>
                      <td>{c.vendorName}</td>
                      <td className="max-w-[16rem] truncate" title={record?.scopeOfWork ?? record?.description ?? ''} style={{ color: 'var(--text-muted)' }}>
                        {record?.scopeOfWork ?? record?.description ?? '-'}
                      </td>
                      <td style={{ color: 'var(--text-subtle)' }}>{record?.lines.map((l) => l.costCode.code).join(', ') || '-'}</td>
                      <td>
                        <StatusPill status={c.status} />
                      </td>
                      <td className="num">{money(c.originalAmount)}</td>
                      <td className="num">
                        <Variance value={c.approvedChanges} favorableWhen="negative" />
                      </td>
                      <td className="num" style={{ color: c.pendingChanges > 0 ? 'var(--caution)' : undefined }}>
                        {money(c.pendingChanges)}
                      </td>
                      <td className="num font-medium">{money(c.currentValue)}</td>
                      <td>
                        <Meter value={c.pctComplete} showLabel={false} height={4} />
                        <span className="tnum text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          {percent(c.pctComplete, 0)}
                        </span>
                      </td>
                      <td className="num">{money(c.invoicedToDate)}</td>
                      <td className="num">{money(c.paidToDate)}</td>
                      <td className="num">{money(c.retentionHeld)}</td>
                      <td className="num" style={{ color: c.outstanding > 0 ? 'var(--caution)' : undefined }}>
                        {money(c.outstanding)}
                      </td>
                      <td className="num">{money(c.remainingBalance)}</td>
                      <td className="num">{money(c.forecastFinalCost)}</td>
                      <td className="num">
                        <Variance value={c.buyoutVariance} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Total, {rows.length}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.originalAmount))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.approvedChanges))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.pendingChanges))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.currentValue))}</td>
                  <td />
                  <td className="num">{money(sumBy(rows, (c) => c.invoicedToDate))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.paidToDate))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.retentionHeld))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.outstanding))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.remainingBalance))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.forecastFinalCost))}</td>
                  <td className="num">{money(sumBy(rows, (c) => c.buyoutVariance))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Section>
    )
  }

  return (
    <div className="space-y-6">
      <Section title="Commitment position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Subcontracts" amount={f.subcontracts.currentValue} detail={`${subcontracts.length} agreements`} />
          <MoneyKpi label="Purchase orders" amount={f.purchaseOrders.currentValue} detail={`${purchaseOrders.length} orders`} />
          <MoneyKpi label="Total committed" amount={f.committed} detail={percent(f.committed / (f.currentBudget || 1))} />
          <MoneyKpi label="Invoiced to date" amount={f.subcontracts.invoicedToDate + f.purchaseOrders.invoicedToDate} />
          <MoneyKpi label="Paid to date" amount={f.subcontracts.paidToDate + f.purchaseOrders.paidToDate} />
          <MoneyKpi
            label="Outstanding payable"
            amount={f.accountsPayable}
            tone={f.accountsPayable > 0 ? 'caution' : 'neutral'}
            detail={<>Retention held {moneyShort(f.retentionPayable)}</>}
          />
        </KpiGrid>
      </Section>

      {overCommitted.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
        >
          {overCommitted.length} line item{overCommitted.length === 1 ? '' : 's'} carry more commitment than budget:{' '}
          {overCommitted.map((l) => `${l.code} (${money(l.committed - l.currentBudget)} over)`).join(', ')}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Commitment against budget by line item" subtitle="Anything past the budget bar needs a change order">
          <HorizontalBars
            labels={f.lines.filter((l) => l.committed > 0).map((l) => `${l.code} ${l.description}`)}
            format="moneyShort"
            series={[
              { key: 'budget', label: 'Current budget', values: f.lines.filter((l) => l.committed > 0).map((l) => l.currentBudget) },
              { key: 'committed', label: 'Committed', values: f.lines.filter((l) => l.committed > 0).map((l) => l.committed), color: 'var(--caution)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Commitment drawdown" subtitle="Invoiced and paid against the current committed value">
          <HorizontalBars
            labels={commitments.map((c) => `${c.number} ${c.vendorName}`)}
            format="moneyShort"
            series={[
              { key: 'value', label: 'Current value', values: commitments.map((c) => c.currentValue) },
              { key: 'invoiced', label: 'Invoiced', values: commitments.map((c) => c.invoicedToDate), color: 'var(--caution)' },
              { key: 'paid', label: 'Paid', values: commitments.map((c) => c.paidToDate), color: 'var(--favorable)' },
            ]}
          />
        </ChartFrame>
      </div>

      {renderTable(subcontracts, 'Subcontracts', 'Original value, approved and pending changes, invoicing, retention and forecast final cost')}
      {renderTable(purchaseOrders, 'Purchase orders and material commitments', 'Material and equipment commitments with delivery tracking')}

      {purchaseOrders.length > 0 && (
        <Section title="Delivery tracking" description="Expected against actual delivery on material and equipment orders">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>PO</th>
                    <th>Vendor</th>
                    <th>Description</th>
                    <th>Issued</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th className="num">Days late</th>
                    <th className="num">Ordered</th>
                    <th className="num">Received</th>
                    <th className="num">Open balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map((c) => {
                    const record = recordById.get(c.id)!
                    const reference = record.actualDelivery ?? project.dataDate ?? new Date()
                    const daysLate = record.expectedDelivery
                      ? Math.max(0, Math.round((reference.getTime() - record.expectedDelivery.getTime()) / 86_400_000))
                      : 0
                    return (
                      <tr key={c.id}>
                        <td className="font-medium">{c.number}</td>
                        <td>{c.vendorName}</td>
                        <td className="max-w-[18rem] truncate" style={{ color: 'var(--text-muted)' }}>
                          {record.description ?? '-'}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(record.dateIssued)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(record.expectedDelivery)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(record.actualDelivery)}</td>
                        <td className="num" style={{ color: daysLate > 0 ? 'var(--adverse)' : 'var(--text-muted)' }}>
                          {daysLate > 0 ? daysLate : '-'}
                        </td>
                        <td className="num">{money(c.currentValue)}</td>
                        <td className="num">{money(record.receivedAmount)}</td>
                        <td className="num">{money(c.currentValue - record.receivedAmount)}</td>
                        <td>
                          <StatusPill status={c.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {canEdit && (
        <Section
          title="Add a commitment"
          description="Subcontracts and purchase orders post against the budget the moment they are saved."
        >
          <CommitmentForm
            projectId={project.id}
            vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
            costCodes={costCodes.map((c) => ({ id: c.costCodeId, label: `${c.description} (${CATEGORY_LABELS[c.category]})` }))}
            defaultRetentionPct={project.defaultSubRetentionPct}
            action={createCommitment}
            commitments={commitments.map((c) => ({ id: c.id, label: `${c.number} ${c.vendorName}` }))}
            changeAction={addCommitmentChange}
          />
        </Section>
      )}

      {commitmentRecords.some((c) => c.changes.length > 0) && (
        <Section title="Commitment changes" description="Subcontract and purchase-order change orders">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Commitment</th>
                    <th>Vendor</th>
                    <th>Number</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Approved</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {commitmentRecords.flatMap((c) =>
                    c.changes.map((ch) => (
                      <tr key={ch.id}>
                        <td className="font-medium">{c.number}</td>
                        <td>{c.vendor.name}</td>
                        <td>{ch.number}</td>
                        <td className="max-w-[20rem] truncate" style={{ color: 'var(--text-muted)' }}>
                          {ch.description}
                        </td>
                        <td>
                          <StatusPill status={ch.status} />
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(ch.dateSubmitted)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(ch.dateApproved)}</td>
                        <td className="num">{money(ch.amount)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
