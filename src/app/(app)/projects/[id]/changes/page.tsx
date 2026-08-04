import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { changeOrderSummary } from '@/lib/finance'
import { date, money, moneyShort, percent, titleize } from '@/lib/format'
import { EmptyState, KpiGrid, MoneyKpi, Kpi, Section, StatusPill, Variance, InfoNote } from '@/components/ui'
import { ChartFrame, DonutChart, HorizontalBars } from '@/components/charts/primitives'
import { ChangeOrderForm } from '@/components/project/change-order-form'
import { createChangeOrder, updateChangeOrderStatus, setPendingInclusion } from './actions'

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f, changeOrders, changeOrderRecords } = bundle
  const canEdit = can(user.role, 'edit:change_orders')
  const showMargins = can(user.role, 'view:margins')

  const [trades, costCodes] = await Promise.all([
    prisma.trade.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.costCode.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { code: 'asc' } }),
  ])

  const summary = changeOrderSummary(changeOrders)
  const recordById = new Map(changeOrderRecords.map((c) => [c.id, c]))

  const byStatus = new Map<string, { count: number; owner: number; cost: number }>()
  for (const co of changeOrders) {
    const entry = byStatus.get(co.status) ?? { count: 0, owner: 0, cost: 0 }
    entry.count += 1
    entry.owner += co.ownerAmount
    entry.cost += co.costAmount
    byStatus.set(co.status, entry)
  }
  const statusRows = [...byStatus.entries()].sort((a, b) => b[1].owner - a[1].owner)

  const byTrade = new Map<string, number>()
  for (const co of changeOrders) {
    const record = recordById.get(co.id)
    const name = record?.trade?.name ?? 'Unassigned'
    byTrade.set(name, (byTrade.get(name) ?? 0) + co.ownerAmount)
  }
  const tradeRows = [...byTrade.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <Section title="Change-order position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Approved revenue" amount={summary.approvedRevenue} detail={`${summary.approvedCount} approved`} />
          {showMargins && (
            <MoneyKpi
              label="Approved margin"
              amount={summary.approvedMargin}
              tone={summary.approvedMargin < 0 ? 'adverse' : 'favorable'}
              detail={percent(summary.approvedMarginPct)}
            />
          )}
          <MoneyKpi
            label="Pending revenue"
            amount={summary.pendingRevenue}
            tone="caution"
            detail={`${summary.pendingCount} awaiting a decision`}
          />
          <MoneyKpi
            label="Weighted pending"
            amount={summary.weightedPendingRevenue}
            hint="Pending revenue × each change order's probability of approval."
          />
          <MoneyKpi label="Rejected / void" amount={summary.rejectedValue} detail={`${summary.rejectedCount} closed out`} />
          <Kpi
            label="Average days pending"
            value={summary.avgDaysPending ? Math.round(summary.avgDaysPending).toString() : '-'}
            tone={summary.avgDaysPending > 30 ? 'caution' : 'neutral'}
            detail={`${summary.scheduleImpactDays} days of approved schedule impact`}
          />
        </KpiGrid>
      </Section>

      <InfoNote>
        Contract position: original {money(f.contract.originalContract)} + approved {money(f.contract.approvedChangeOrders)} ={' '}
        <strong>{money(f.contract.currentContract)}</strong> current. With every pending change order approved the contract would reach{' '}
        {money(f.contract.potentialContract)}. Forecasting currently includes{' '}
        {percent(project.pendingCoInclusionPct, 0)} of the weighted pending exposure.
      </InfoNote>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartFrame title="Value by status">
          <DonutChart
            format="moneyShort"
            centerLabel="Total raised"
            centerValue={moneyShort(statusRows.reduce((a, [, v]) => a + v.owner, 0))}
            slices={statusRows.map(([status, v]) => ({ label: titleize(status), value: v.owner }))}
          />
        </ChartFrame>

        <ChartFrame title="Revenue vs cost by change order" subtitle="The gap is the margin earned on the change" className="lg:col-span-2">
          <HorizontalBars
            labels={changeOrders.map((c) => `${c.number} ${recordById.get(c.id)?.description.slice(0, 40) ?? ''}`)}
            format="moneyShort"
            series={[
              { key: 'owner', label: 'Owner amount', values: changeOrders.map((c) => c.ownerAmount) },
              { key: 'cost', label: 'Cost amount', values: changeOrders.map((c) => c.costAmount), color: 'var(--caution)' },
            ]}
          />
        </ChartFrame>
      </div>

      {tradeRows.length > 0 && (
        <ChartFrame title="Change-order value by trade">
          <HorizontalBars
            labels={tradeRows.map(([name]) => name)}
            format="moneyShort"
            series={[{ key: 'value', label: 'Owner amount', values: tradeRows.map(([, value]) => value) }]}
          />
        </ChartFrame>
      )}

      <Section title="Change order log" description="Potential change events, owner change orders and internal budget changes">
        {changeOrders.length === 0 ? (
          <EmptyState title="No change orders yet" description="Raise the first one below. Approved orders flow straight into the contract sum and the budget." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Trade</th>
                    <th>Origin</th>
                    <th>Status</th>
                    <th className="num">Owner amount</th>
                    <th className="num">Cost amount</th>
                    {showMargins && <th className="num">Margin</th>}
                    {showMargins && <th className="num">Margin %</th>}
                    <th className="num">Probability</th>
                    <th>Initiated</th>
                    <th>Approved</th>
                    <th className="num">Days pending</th>
                    <th className="num">Schedule</th>
                    {canEdit && <th />}
                  </tr>
                </thead>
                <tbody>
                  {changeOrders.map((co) => {
                    const record = recordById.get(co.id)!
                    return (
                      <tr key={co.id}>
                        <td className="font-medium">{co.number}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{titleize(co.type)}</td>
                        <td className="max-w-[20rem] truncate" title={record.description}>
                          {record.description}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{record.trade?.name ?? '-'}</td>
                        <td style={{ color: 'var(--text-subtle)' }}>{record.origin ?? '-'}</td>
                        <td>
                          <StatusPill status={co.status} />
                        </td>
                        <td className="num">{money(co.ownerAmount)}</td>
                        <td className="num">{money(co.costAmount)}</td>
                        {showMargins && (
                          <td className="num">
                            <Variance value={co.margin} showSign={false} />
                          </td>
                        )}
                        {showMargins && <td className="num">{percent(co.marginPct)}</td>}
                        <td className="num">{co.isApproved ? '-' : percent(co.probabilityPct, 0)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(co.dateInitiated)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{date(co.dateApproved)}</td>
                        <td className="num" style={{ color: co.isPending && co.daysPending > 30 ? 'var(--caution)' : undefined }}>
                          {co.daysPending || '-'}
                        </td>
                        <td className="num">{co.scheduleImpactDays || '-'}</td>
                        {canEdit && (
                          <td className="no-print">
                            <form action={updateChangeOrderStatus} className="flex items-center gap-1">
                              <input type="hidden" name="changeOrderId" value={co.id} />
                              <select name="status" defaultValue={co.status} className="field w-auto py-0.5 text-[11px]" aria-label={`Status for ${co.number}`}>
                                {['DRAFT', 'PRICING', 'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'VOID', 'EXECUTED'].map((s) => (
                                  <option key={s} value={s}>
                                    {titleize(s)}
                                  </option>
                                ))}
                              </select>
                              <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                                Set
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
                    <td colSpan={6}>Total, {changeOrders.length}</td>
                    <td className="num">{money(changeOrders.reduce((a, c) => a + c.ownerAmount, 0))}</td>
                    <td className="num">{money(changeOrders.reduce((a, c) => a + c.costAmount, 0))}</td>
                    {showMargins && <td className="num">{money(changeOrders.reduce((a, c) => a + c.margin, 0))}</td>}
                    {showMargins && <td />}
                    <td colSpan={canEdit ? 6 : 5} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      {canEdit && (
        <>
          <Section
            title="Raise a change order"
            description="An approved change order updates the contract sum and posts its cost impact to the budget."
          >
            <ChangeOrderForm
              projectId={project.id}
              trades={trades.map((t) => ({ id: t.id, label: t.name }))}
              costCodes={costCodes.map((c) => ({ id: c.id, label: `${c.code} ${c.description}` }))}
              action={createChangeOrder}
            />
          </Section>

          <Section
            title="Pending exposure in the forecast"
            description="How much of the weighted pending change-order value the project forecast should include"
          >
            <form action={setPendingInclusion} className="card flex flex-wrap items-end gap-3 p-4">
              <input type="hidden" name="projectId" value={project.id} />
              <div>
                <label htmlFor="inclusion" className="label mb-1.5 block">
                  Inclusion (0 = exclude, 1 = include in full)
                </label>
                <input
                  id="inclusion"
                  name="pendingCoInclusionPct"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  className="field w-40 text-xs"
                  defaultValue={project.pendingCoInclusionPct}
                />
              </div>
              <p className="flex-1 text-xs" style={{ color: 'var(--text-subtle)' }}>
                At the current setting the forecast contract is {money(f.contract.forecastContract)}. Including the full weighted exposure
                would make it {money(f.contract.currentContract + f.contract.weightedPendingChangeOrders)}.
              </p>
              <button type="submit" className="btn btn-primary">
                Apply
              </button>
            </form>
          </Section>
        </>
      )}
    </div>
  )
}
