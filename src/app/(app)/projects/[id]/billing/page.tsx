import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { buildG702, sumBy } from '@/lib/finance'
import { date, money, moneyShort, percent } from '@/lib/format'
import { EmptyState, ExportMenu, KpiGrid, MoneyKpi, Section, StatusPill, Variance, DataList } from '@/components/ui'
import { ChartFrame, BarChart, Meter } from '@/components/charts/primitives'
import { PayApplicationForm } from '@/components/project/pay-application-form'
import { createPayApplication, recordPayment } from './actions'

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ app?: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const { app } = await searchParams
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, billings, sovLines } = bundle
  const canEdit = can(user.role, 'edit:owner_billing')

  const applications = [...billings].sort((a, b) => a.appNumber - b.appNumber)
  const g702s = applications.map((a) =>
    buildG702(a, applications, sovLines, f.contract.originalContract, f.contract.approvedChangeOrders, f.dataDate),
  )

  const selectedNumber = app ? Number(app) : g702s.at(-1)?.appNumber
  const selected = g702s.find((g) => g.appNumber === selectedNumber) ?? g702s.at(-1)

  const nextAppNumber = (g702s.at(-1)?.appNumber ?? 0) + 1
  const priorBySov = new Map<string, number>()
  for (const a of applications) {
    for (const line of a.lines) {
      priorBySov.set(line.sovLineId, (priorBySov.get(line.sovLineId) ?? 0) + line.workThisPeriod + line.storedMaterials)
    }
  }

  return (
    <div className="space-y-6">
      <Section title="Billing position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Contract sum to date" amount={f.contract.currentContract} detail={<>Original {moneyShort(f.contract.originalContract)}</>} />
          <MoneyKpi label="Completed and stored" amount={f.billing.totalCompletedAndStored} detail={percent(f.billing.billedPctOfContract)} />
          <MoneyKpi label="Retainage held" amount={f.billing.retainageHeld} detail={percent(project.ownerRetentionPct, 1)} />
          <MoneyKpi label="Collected" amount={f.billing.amountCollected} />
          <MoneyKpi
            label="Accounts receivable"
            amount={f.billing.accountsReceivable}
            tone={f.billing.accountsReceivable > 0 ? 'caution' : 'favorable'}
          />
          <MoneyKpi label="Balance to finish" amount={f.billing.remainingContractBalance} hint="Contract sum less total earned including retainage." />
        </KpiGrid>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartFrame title="Billing and collection history" subtitle="Each application against what was collected" className="lg:col-span-2">
          {g702s.length > 0 ? (
            <BarChart
              labels={g702s.map((g) => `App ${g.appNumber}`)}
              height={240}
              format="moneyShort"
              series={[
                { key: 'due', label: 'Payment due', values: g702s.map((g) => g.currentPaymentDue), color: 'var(--accent)' },
                { key: 'paid', label: 'Collected', values: g702s.map((g) => g.amountPaid), color: 'var(--favorable)' },
                { key: 'retainage', label: 'Retainage held', values: g702s.map((g) => g.retainage), color: 'var(--caution)' },
              ]}
            />
          ) : (
            <EmptyState title="No pay applications yet" description="Issue the first application below." />
          )}
        </ChartFrame>

        <ChartFrame title="Earned vs billed" subtitle="Where the project sits against its own progress">
          <DataList
            columns={1}
            items={[
              { label: 'Revenue earned', value: money(f.revenue.revenueEarned), hint: 'Contract × percent complete' },
              { label: 'Amount billed', value: money(f.revenue.amountBilled) },
              {
                label: f.revenue.overbilled > 0 ? 'Overbilled' : 'Underbilled',
                value: (
                  <span style={{ color: f.revenue.underbilled > 0 ? 'var(--caution)' : 'var(--favorable)' }}>
                    {money(f.revenue.overbilled > 0 ? f.revenue.overbilled : f.revenue.underbilled)}
                  </span>
                ),
              },
              { label: 'Remaining revenue', value: money(f.revenue.remainingRevenue) },
              { label: 'Backlog', value: money(f.backlog) },
            ]}
          />
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Billed</span>
              <span>{percent(f.billing.billedPctOfContract)}</span>
            </div>
            <Meter value={f.billing.billedPctOfContract} target={f.revenue.pctComplete} showLabel={false} />
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              The marker shows percent complete. Billing to the left of it means the project is underbilled.
            </p>
          </div>
        </ChartFrame>
      </div>

      <Section title="Application register" description="Never delete a prior application — each one restates the cumulative position">
        {g702s.length === 0 ? (
          <EmptyState title="No applications" description="The register will build as pay applications are issued." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>App</th>
                    <th>Period to</th>
                    <th>Submitted</th>
                    <th className="num">Contract sum</th>
                    <th className="num">Completed &amp; stored</th>
                    <th className="num">% complete</th>
                    <th className="num">Retainage</th>
                    <th className="num">Earned less retainage</th>
                    <th className="num">Less previous</th>
                    <th className="num">Payment due</th>
                    <th className="num">Balance to finish</th>
                    <th>Approved</th>
                    <th>Paid</th>
                    <th className="num">Amount paid</th>
                    <th className="num">AR</th>
                    <th className="num">Days out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {g702s.map((g) => (
                    <tr key={g.appNumber} style={g.appNumber === selected?.appNumber ? { background: 'var(--accent-soft)' } : undefined}>
                      <td>
                        <Link href={`?app=${g.appNumber}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                          {g.appNumber}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(g.periodTo)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(applications.find((a) => a.appNumber === g.appNumber)?.dateSubmitted)}</td>
                      <td className="num">{money(g.contractSumToDate)}</td>
                      <td className="num">{money(g.totalCompletedAndStored)}</td>
                      <td className="num">{percent(g.pctComplete)}</td>
                      <td className="num">{money(g.retainage)}</td>
                      <td className="num">{money(g.totalEarnedLessRetainage)}</td>
                      <td className="num">{money(g.lessPreviousCertificates)}</td>
                      <td className="num font-medium">{money(g.currentPaymentDue)}</td>
                      <td className="num">{money(g.balanceToFinishIncludingRetainage)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(applications.find((a) => a.appNumber === g.appNumber)?.dateApproved)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(applications.find((a) => a.appNumber === g.appNumber)?.datePaid)}</td>
                      <td className="num">{money(g.amountPaid)}</td>
                      <td className="num" style={{ color: g.arOutstanding > 0 ? 'var(--caution)' : undefined }}>
                        {money(g.arOutstanding)}
                      </td>
                      <td className="num" style={{ color: (g.daysOutstanding ?? 0) > 45 ? 'var(--adverse)' : undefined }}>
                        {g.daysOutstanding ?? '—'}
                      </td>
                      <td>
                        <StatusPill status={g.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={9}>Cumulative position</td>
                    <td className="num">{money(sumBy(g702s, (g) => g.currentPaymentDue))}</td>
                    <td />
                    <td colSpan={2} />
                    <td className="num">{money(sumBy(g702s, (g) => g.amountPaid))}</td>
                    <td className="num">{money(f.billing.accountsReceivable)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      {selected && (
        <Section
          title={`Application ${selected.appNumber} — AIA G702 / G703`}
          description={`Period to ${date(selected.periodTo)}`}
          actions={
            <ExportMenu
              excelHref={`/api/export/billing/${project.id}?app=${selected.appNumber}`}
              pdfHref={`/api/pdf/billing/${project.id}?app=${selected.appNumber}`}
              label="Export application"
              size="small"
            />
          }
        >
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="card p-4 lg:col-span-1">
              <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Certificate summary
              </h3>
              <DataList
                columns={1}
                items={[
                  { label: 'Original contract sum', value: money(selected.originalContract) },
                  { label: 'Net change by change orders', value: money(selected.netChangeByChangeOrders) },
                  { label: 'Contract sum to date', value: money(selected.contractSumToDate) },
                  { label: 'Total completed and stored', value: money(selected.totalCompletedAndStored) },
                  { label: `Retainage (${percent(selected.retainagePct, 1)})`, value: money(selected.retainage) },
                  { label: 'Total earned less retainage', value: money(selected.totalEarnedLessRetainage) },
                  { label: 'Less previous certificates', value: money(selected.lessPreviousCertificates) },
                  { label: 'CURRENT PAYMENT DUE', value: <strong>{money(selected.currentPaymentDue)}</strong> },
                  { label: 'Balance to finish incl. retainage', value: money(selected.balanceToFinishIncludingRetainage) },
                ]}
              />
            </div>

            <div className="card-flush lg:col-span-2">
              <div className="table-wrap" style={{ maxHeight: '28rem', overflowY: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Description of work</th>
                      <th className="num">Scheduled value</th>
                      <th className="num">From previous</th>
                      <th className="num">This period</th>
                      <th className="num">Stored materials</th>
                      <th className="num">Total completed &amp; stored</th>
                      <th className="num">%</th>
                      <th className="num">Balance to finish</th>
                      <th className="num">Retainage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((l) => (
                      <tr key={l.sovLineId}>
                        <td className="font-medium">{l.number}</td>
                        <td className="max-w-[16rem] truncate" title={l.description}>
                          {l.description}
                        </td>
                        <td className="num">{money(l.scheduledValue)}</td>
                        <td className="num">{money(l.fromPreviousApplication)}</td>
                        <td className="num">{money(l.workThisPeriod)}</td>
                        <td className="num">{money(l.storedMaterials)}</td>
                        <td className="num">{money(l.totalCompletedAndStored)}</td>
                        <td className="num">{percent(l.pctComplete, 0)}</td>
                        <td className="num">{money(l.balanceToFinish)}</td>
                        <td className="num">{money(l.retainage)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td className="num">{money(sumBy(selected.lines, (l) => l.scheduledValue))}</td>
                      <td className="num">{money(sumBy(selected.lines, (l) => l.fromPreviousApplication))}</td>
                      <td className="num">{money(sumBy(selected.lines, (l) => l.workThisPeriod))}</td>
                      <td className="num">{money(sumBy(selected.lines, (l) => l.storedMaterials))}</td>
                      <td className="num">{money(selected.totalCompletedAndStored)}</td>
                      <td className="num">{percent(selected.pctComplete, 0)}</td>
                      <td className="num">{money(sumBy(selected.lines, (l) => l.balanceToFinish))}</td>
                      <td className="num">{money(selected.retainage)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {canEdit && selected.arOutstanding > 0.005 && (
            <form action={recordPayment} className="card flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="appNumber" value={selected.appNumber} />
              <div>
                <label htmlFor="payment-amount" className="label mb-1.5 block">
                  Record a collection against application {selected.appNumber}
                </label>
                <input
                  id="payment-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="field w-40 text-xs"
                  defaultValue={selected.arOutstanding.toFixed(2)}
                />
              </div>
              <div>
                <label htmlFor="payment-date" className="label mb-1.5 block">
                  Date paid
                </label>
                <input id="payment-date" name="datePaid" type="date" required className="field w-40 text-xs" />
              </div>
              <button type="submit" className="btn btn-primary">
                Record payment
              </button>
              <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                {money(selected.arOutstanding)} outstanding on this application.
              </p>
            </form>
          )}
        </Section>
      )}

      {canEdit && (
        <Section
          title={`Issue application ${nextAppNumber}`}
          description="Enter this period's work against the schedule of values. Everything else on the certificate calculates."
        >
          <PayApplicationForm
            projectId={project.id}
            appNumber={nextAppNumber}
            retainagePct={project.ownerRetentionPct}
            lines={sovLines.map((s) => ({
              id: s.id,
              number: s.number,
              description: s.description,
              scheduledValue: s.scheduledValue,
              fromPrevious: priorBySov.get(s.id) ?? 0,
            }))}
            action={createPayApplication}
          />
        </Section>
      )}

      <Section title="Schedule of values" description="The contract broken into billable lines">
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th className="num">Scheduled value</th>
                  <th className="num">Billed to date</th>
                  <th className="num">Remaining</th>
                  <th style={{ minWidth: 140 }}>Progress</th>
                </tr>
              </thead>
              <tbody>
                {sovLines.map((s) => {
                  const billed = priorBySov.get(s.id) ?? 0
                  return (
                    <tr key={s.id}>
                      <td className="font-medium">{s.number}</td>
                      <td>{s.description}</td>
                      <td className="num">{money(s.scheduledValue)}</td>
                      <td className="num">{money(billed)}</td>
                      <td className="num">{money(s.scheduledValue - billed)}</td>
                      <td>
                        <Meter value={s.scheduledValue ? billed / s.scheduledValue : 0} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total — must equal the contract sum</td>
                  <td className="num">{money(sumBy(sovLines, (s) => s.scheduledValue))}</td>
                  <td className="num">{money(f.billing.totalCompletedAndStored)}</td>
                  <td className="num">{money(sumBy(sovLines, (s) => s.scheduledValue) - f.billing.totalCompletedAndStored)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        {Math.abs(sumBy(sovLines, (s) => s.scheduledValue) - f.contract.currentContract) > 1 && (
          <div
            className="mt-2 rounded-lg border px-3 py-2 text-xs"
            style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
          >
            The schedule of values totals {money(sumBy(sovLines, (s) => s.scheduledValue))} but the contract sum is{' '}
            {money(f.contract.currentContract)} — a difference of{' '}
            <Variance value={f.contract.currentContract - sumBy(sovLines, (s) => s.scheduledValue)} />. Add a change-order line to the
            schedule of values so the owner can be billed for the approved changes.
          </div>
        )}
      </Section>
    </div>
  )
}
