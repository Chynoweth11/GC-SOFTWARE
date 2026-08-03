import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { paymentStatus, sumBy } from '@/lib/finance'
import { date, money, moneyShort, percent } from '@/lib/format'
import { EmptyState, KpiGrid, MoneyKpi, Section, StatusPill, Variance, Pill } from '@/components/ui'
import { ChartFrame, HorizontalBars, Meter } from '@/components/charts/primitives'
import { SubInvoiceForm } from '@/components/project/sub-invoice-form'
import { createSubInvoice, approveSubInvoice, paySubInvoice, toggleVendorHold } from './actions'

export default async function SubsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, commitments, commitmentRecords } = bundle
  const canEdit = can(user.role, 'edit:sub_billing')

  const [invoices, costCodes] = await Promise.all([
    prisma.subInvoice.findMany({
      where: { projectId: id },
      include: { vendor: true, commitment: true, costCode: true },
      orderBy: [{ periodEnd: 'desc' }, { invoiceNumber: 'asc' }],
    }),
    prisma.costCode.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { code: 'asc' } }),
  ])

  const dataDate = project.dataDate ?? new Date()
  const invoiceRows = invoices.map((i) => ({
    record: i,
    ...paymentStatus(
      {
        amount: i.amount,
        retentionPct: i.retentionPct,
        approved: i.approved,
        amountPaid: i.amountPaid,
        dateReceived: i.dateReceived,
        datePaid: i.datePaid,
        lienWaiverReceived: i.lienWaiverReceived,
      },
      dataDate,
    ),
  }))

  const overdue = invoiceRows.filter((r) => r.status === 'OVERDUE')
  const paidWithoutWaiver = invoiceRows.filter((r) => r.status === 'PAID' && !r.record.lienWaiverReceived)
  const subcontracts = commitments.filter((c) => c.type === 'SUBCONTRACT')
  const vendorRecords = commitmentRecords.filter((c) => c.type === 'SUBCONTRACT')

  return (
    <div className="space-y-6">
      <Section title="Subcontractor position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Current subcontract value" amount={f.subcontracts.currentValue} detail={`${subcontracts.length} agreements`} />
          <MoneyKpi label="Invoiced to date" amount={f.subcontracts.invoicedToDate} detail={percent(f.subcontracts.invoicedToDate / (f.subcontracts.currentValue || 1))} />
          <MoneyKpi label="Paid to date" amount={f.subcontracts.paidToDate} />
          <MoneyKpi label="Retention withheld" amount={f.subcontracts.retentionHeld} />
          <MoneyKpi
            label="Outstanding"
            amount={f.subcontracts.outstanding}
            tone={overdue.length > 0 ? 'adverse' : f.subcontracts.outstanding > 0 ? 'caution' : 'favorable'}
            detail={overdue.length > 0 ? `${overdue.length} overdue` : 'All current'}
          />
          <MoneyKpi label="Balance to complete" amount={f.subcontracts.remainingBalance} />
        </KpiGrid>
      </Section>

      {(overdue.length > 0 || paidWithoutWaiver.length > 0) && (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}>
              {overdue.length} invoice{overdue.length === 1 ? '' : 's'} unpaid more than 30 days after receipt —{' '}
              {money(sumBy(overdue, (r) => r.outstanding))} outstanding to{' '}
              {[...new Set(overdue.map((r) => r.record.vendor.name))].join(', ')}.
            </div>
          )}
          {paidWithoutWaiver.length > 0 && (
            <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}>
              {paidWithoutWaiver.length} invoice{paidWithoutWaiver.length === 1 ? '' : 's'} paid without a lien waiver on file.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Subcontract drawdown" subtitle="Invoiced and paid against the current value">
          <HorizontalBars
            labels={subcontracts.map((c) => c.vendorName)}
            format="moneyShort"
            series={[
              { key: 'value', label: 'Current value', values: subcontracts.map((c) => c.currentValue) },
              { key: 'invoiced', label: 'Invoiced', values: subcontracts.map((c) => c.invoicedToDate), color: 'var(--caution)' },
              { key: 'paid', label: 'Paid', values: subcontracts.map((c) => c.paidToDate), color: 'var(--favorable)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Buyout position" subtitle="Budget carried against the value actually contracted">
          <HorizontalBars
            labels={subcontracts.map((c) => c.vendorName)}
            format="moneyShort"
            series={[
              { key: 'budget', label: 'Budget', values: subcontracts.map((c) => c.budgetAmount) },
              { key: 'contracted', label: 'Contracted', values: subcontracts.map((c) => c.originalAmount), color: 'var(--accent)' },
            ]}
          />
        </ChartFrame>
      </div>

      <Section title="Subcontractor financials" description="Contract value, progress, invoicing, retention and compliance hold">
        {subcontracts.length === 0 ? (
          <EmptyState title="No subcontracts on this project" description="Add subcontracts from the commitments tab." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Subcontractor</th>
                    <th>Trade</th>
                    <th>Contract</th>
                    <th className="num">Original</th>
                    <th className="num">Approved COs</th>
                    <th className="num">Pending COs</th>
                    <th className="num">Current value</th>
                    <th style={{ minWidth: 110 }}>% complete</th>
                    <th className="num">Earned</th>
                    <th className="num">Invoiced</th>
                    <th className="num">Approved</th>
                    <th className="num">Paid</th>
                    <th className="num">Retention</th>
                    <th className="num">Outstanding</th>
                    <th className="num">Balance to complete</th>
                    <th className="num">Forecast final</th>
                    <th>Compliance</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {subcontracts.map((c) => {
                    const record = vendorRecords.find((r) => r.id === c.id)!
                    const vendor = record.vendor
                    const expirations = [vendor.glExpiration, vendor.wcExpiration, vendor.autoExpiration, vendor.umbrellaExpiration].filter(
                      (d): d is Date => d != null,
                    )
                    const earliest = expirations.length ? new Date(Math.min(...expirations.map((d) => d.getTime()))) : null
                    const coiStatus = !earliest
                      ? 'MISSING'
                      : earliest < dataDate
                        ? 'EXPIRED'
                        : earliest.getTime() - dataDate.getTime() < 30 * 86_400_000
                          ? 'EXPIRING'
                          : 'CURRENT'
                    return (
                      <tr key={c.id}>
                        <td className="font-medium">{c.vendorName}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{vendor.trade?.name ?? '—'}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{c.number}</td>
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
                        <td className="num">{money(c.earnedToDate)}</td>
                        <td className="num">{money(c.invoicedToDate)}</td>
                        <td className="num">{money(c.approvedToDate)}</td>
                        <td className="num">{money(c.paidToDate)}</td>
                        <td className="num">{money(c.retentionHeld)}</td>
                        <td className="num" style={{ color: c.outstanding > 0 ? 'var(--caution)' : undefined }}>
                          {money(c.outstanding)}
                        </td>
                        <td className="num">{money(c.remainingBalance)}</td>
                        <td className="num">{money(c.forecastFinalCost)}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <StatusPill
                              status={coiStatus === 'CURRENT' ? 'APPROVED' : coiStatus === 'EXPIRING' ? 'PENDING' : 'REJECTED'}
                              label={coiStatus === 'CURRENT' ? 'Insurance current' : coiStatus === 'EXPIRING' ? 'Insurance expiring' : coiStatus === 'EXPIRED' ? 'Insurance expired' : 'No insurance'}
                            />
                            {vendor.paymentHold && <Pill tone="adverse">Payment hold</Pill>}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="no-print">
                            <form action={toggleVendorHold}>
                              <input type="hidden" name="vendorId" value={vendor.id} />
                              <input type="hidden" name="projectId" value={project.id} />
                              <input type="hidden" name="hold" value={vendor.paymentHold ? 'false' : 'true'} />
                              <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                                {vendor.paymentHold ? 'Release' : 'Hold'}
                              </button>
                            </form>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total — {subcontracts.length}</td>
                    <td className="num">{money(f.subcontracts.originalValue)}</td>
                    <td className="num">{money(f.subcontracts.approvedChanges)}</td>
                    <td className="num">{money(f.subcontracts.pendingChanges)}</td>
                    <td className="num">{money(f.subcontracts.currentValue)}</td>
                    <td />
                    <td className="num">{money(sumBy(subcontracts, (c) => c.earnedToDate))}</td>
                    <td className="num">{money(f.subcontracts.invoicedToDate)}</td>
                    <td className="num">{money(f.subcontracts.approvedToDate)}</td>
                    <td className="num">{money(f.subcontracts.paidToDate)}</td>
                    <td className="num">{money(f.subcontracts.retentionHeld)}</td>
                    <td className="num">{money(f.subcontracts.outstanding)}</td>
                    <td className="num">{money(f.subcontracts.remainingBalance)}</td>
                    <td className="num">{money(f.subcontracts.forecastFinalCost)}</td>
                    <td colSpan={canEdit ? 2 : 1} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Invoices and payments" description={`${invoices.length} pay applications received`}>
        {invoices.length === 0 ? (
          <EmptyState title="No subcontractor invoices yet" description="Log the first one below." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap" style={{ maxHeight: '34rem', overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Subcontractor</th>
                    <th>Cost code</th>
                    <th>Period end</th>
                    <th className="num">Amount</th>
                    <th className="num">Retention</th>
                    <th className="num">Net payable</th>
                    <th>Received</th>
                    <th>Approved</th>
                    <th className="num">Paid</th>
                    <th>Date paid</th>
                    <th className="num">Outstanding</th>
                    <th className="num">Days out</th>
                    <th>Lien waiver</th>
                    <th>Status</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map(({ record: i, status, daysOutstanding, netPayable, outstanding }) => (
                    <tr key={i.id} style={status === 'OVERDUE' ? { background: 'color-mix(in oklab, var(--adverse) 5%, transparent)' } : undefined}>
                      <td className="font-medium">{i.invoiceNumber}</td>
                      <td>{i.vendor.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{i.costCode?.code ?? '—'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(i.periodEnd)}</td>
                      <td className="num">{money(i.amount)}</td>
                      <td className="num">{money(i.amount * i.retentionPct)}</td>
                      <td className="num">{money(netPayable)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(i.dateReceived)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{i.approved ? date(i.dateApproved) : '—'}</td>
                      <td className="num">{money(i.amountPaid)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(i.datePaid)}</td>
                      <td className="num">{money(outstanding)}</td>
                      <td className="num" style={{ color: daysOutstanding > 30 ? 'var(--adverse)' : undefined }}>
                        {daysOutstanding || '—'}
                      </td>
                      <td>{i.lienWaiverReceived ? <Pill tone="favorable">Received</Pill> : <Pill tone="caution">Outstanding</Pill>}</td>
                      <td>
                        <StatusPill status={status} />
                      </td>
                      {canEdit && (
                        <td className="no-print">
                          <div className="flex gap-1">
                            {!i.approved && (
                              <form action={approveSubInvoice}>
                                <input type="hidden" name="invoiceId" value={i.id} />
                                <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                                  Approve
                                </button>
                              </form>
                            )}
                            {outstanding > 0.005 && i.approved && (
                              <form action={paySubInvoice}>
                                <input type="hidden" name="invoiceId" value={i.id} />
                                <input type="hidden" name="amount" value={outstanding.toFixed(2)} />
                                <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                                  Pay
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total — {invoices.length} invoices</td>
                    <td className="num">{money(sumBy(invoices, (i) => i.amount))}</td>
                    <td className="num">{money(sumBy(invoices, (i) => i.amount * i.retentionPct))}</td>
                    <td className="num">{money(sumBy(invoiceRows, (r) => r.netPayable))}</td>
                    <td colSpan={2} />
                    <td className="num">{money(sumBy(invoices, (i) => i.amountPaid))}</td>
                    <td />
                    <td className="num">{money(sumBy(invoiceRows, (r) => r.outstanding))}</td>
                    <td colSpan={canEdit ? 4 : 3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      {canEdit && (
        <Section title="Log an invoice" description="Retention defaults from the subcontract and can be overridden per invoice.">
          <SubInvoiceForm
            projectId={project.id}
            commitments={subcontracts.map((c) => ({
              id: c.id,
              vendorId: c.vendorId,
              label: `${c.number} — ${c.vendorName}`,
              retentionPct: c.retentionPct,
            }))}
            costCodes={costCodes.map((c) => ({ id: c.id, label: `${c.code} — ${c.description}` }))}
            action={createSubInvoice}
          />
        </Section>
      )}
    </div>
  )
}
