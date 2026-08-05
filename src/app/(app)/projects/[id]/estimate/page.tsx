import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { getProjectEstimateComparison } from '@/lib/queries/project-estimate'
import { money, moneyShort, number as fmtNumber, percent } from '@/lib/format'
import {
  Calculated,
  DataList,
  EmptyState,
  InfoNote,
  Kpi,
  KpiGrid,
  MoneyKpi,
  Pill,
  Section,
  Variance,
} from '@/components/ui'
import { ChartFrame, HorizontalBars } from '@/components/charts/primitives'
import { EstimateComparison } from '@/components/project/estimate-comparison'

export const metadata = { title: 'Estimate and takeoff' }

export default async function ProjectEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials } = bundle
  const showMarkups = can(user.role, 'view:markups')
  const showEstimates = can(user.role, 'view:estimates')

  const comparison = await getProjectEstimateComparison(id, user.companyId, financials.lines, {
    original: project.originalContractSum,
    current: financials.contract.currentContract,
  })

  const { rows, totals, bid, takeoff, basis, basisLabel } = comparison
  const estimateLabel = basis === 'estimate' ? 'Estimated' : 'Original budget'

  return (
    <div className="space-y-6">
      <Section
        title="The priced basis of this job"
        description={`Read from ${basisLabel}, against what the job is doing now.`}
        actions={
          showEstimates && takeoff ? (
            <Link href={`/estimating/${takeoff.estimate.id}`} className="btn btn-secondary text-xs">
              Open the full estimate
            </Link>
          ) : undefined
        }
      >
        <KpiGrid cols={5}>
          <MoneyKpi
            label={basis === 'estimate' ? 'Estimated cost' : 'Original budget'}
            amount={bid.directCost}
            detail={basis === 'estimate' ? 'Takeoff plus general conditions' : 'Set when the project was opened'}
            hint={
              basis === 'estimate'
                ? 'The direct cost priced in the estimate, before any markup.'
                : 'The budget the project started with, before any revision or change order.'
            }
          />
          <MoneyKpi
            label="Current budget"
            amount={financials.currentBudget}
            detail={<Variance value={financials.currentBudget - bid.directCost} compact />}
            hint="What the project is working to now, including approved change orders and internal revisions."
          />
          <MoneyKpi
            label="Cost to date"
            amount={financials.totalCostToDate}
            detail={`${percent(financials.revenue.pctComplete)} complete`}
          />
          <MoneyKpi
            label="Committed"
            amount={financials.committed}
            detail="Subcontracts and purchase orders issued"
          />
          <MoneyKpi
            label="Forecast at completion"
            amount={financials.forecastCost}
            detail={<Variance value={bid.directCost - financials.forecastCost} compact />}
            tone={financials.forecastCost > bid.directCost ? 'adverse' : 'favorable'}
            hint="Forecast cost against the cost that was priced. A negative variance means the job is running above what it was priced at."
          />
        </KpiGrid>
      </Section>

      <EstimateComparison rows={rows} totals={totals} estimateLabel={estimateLabel} />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Where the money was priced against where it is going"
          subtitle={`${estimateLabel}, current budget and forecast, side by side by cost type`}
        >
          <HorizontalBars
            labels={rows.map((row) => row.label)}
            format="moneyShort"
            series={[
              { key: 'estimated', label: estimateLabel, values: rows.map((row) => row.estimated) },
              { key: 'budget', label: 'Current budget', values: rows.map((row) => row.currentBudget), color: 'var(--series-neutral)' },
              { key: 'forecast', label: 'Forecast', values: rows.map((row) => row.forecast), color: 'var(--adverse)' },
            ]}
          />
        </ChartFrame>

        <Section title="Price against contract">
          <div className="card p-3.5">
            <DataList
              columns={1}
              items={[
                { label: basis === 'estimate' ? 'Direct cost priced' : 'Original budget', value: money(bid.directCost) },
                ...(showMarkups && bid.totalBid != null
                  ? [
                      { label: 'Total bid submitted', value: money(bid.totalBid) },
                      { label: 'Margin priced into the bid', value: percent(bid.marginPriced ?? 0) },
                    ]
                  : []),
                { label: 'Original contract awarded', value: money(bid.originalContract) },
                {
                  label: 'Contract now, with change orders',
                  value: money(bid.currentContract),
                  hint: 'Original contract plus every approved change order.',
                },
                ...(showMarkups
                  ? [
                      {
                        label: 'Profit at the priced cost',
                        value: money(bid.originalContract - bid.directCost),
                        hint: 'What the job would have returned had it run exactly to the price.',
                      },
                      {
                        label: 'Profit forecast now',
                        value: <Variance value={financials.forecastProfit} showSign={false} />,
                        hint: 'Current contract less forecast cost, from the live cost control figures.',
                      },
                    ]
                  : []),
              ]}
            />
          </div>

          <div className="mt-3">
            <KpiGrid cols={3}>
              <Kpi
                label={`Forecast against the ${basis === 'estimate' ? 'estimate' : 'original budget'}`}
                value={money(Math.abs(totals.varianceToEstimate))}
                detail={totals.varianceToEstimate >= 0 ? 'Under the priced cost' : 'Over the priced cost'}
                tone={totals.varianceToEstimate >= 0 ? 'favorable' : 'adverse'}
              />
              <Kpi
                label="Forecast against the budget"
                value={money(Math.abs(totals.varianceToBudget))}
                detail={totals.varianceToBudget >= 0 ? 'Under the current budget' : 'Over the current budget'}
                tone={totals.varianceToBudget >= 0 ? 'favorable' : 'adverse'}
              />
              <Kpi
                label="Budget moved since"
                value={money(Math.abs(financials.currentBudget - bid.directCost), { dash: false })}
                detail={
                  Math.abs(financials.currentBudget - bid.directCost) < 0.005
                    ? 'Unchanged since the job started'
                    : financials.currentBudget > bid.directCost
                      ? 'Added, mostly approved change orders'
                      : 'Removed since the job started'
                }
              />
            </KpiGrid>
          </div>
        </Section>
      </div>

      {takeoff ? (
        <TakeoffSections takeoff={takeoff} showMarkups={showMarkups} />
      ) : (
        <Section title="Takeoff detail">
          <InfoNote>
            This project was set up directly rather than converted from an estimate, so there is no takeoff behind it.
            The comparison above uses the original budget, which is the same commitment recorded at a coarser grain.
            {showEstimates ? ' Converting an estimate to a project carries its takeoff, quantities, markups, alternates and exclusions through to this tab.' : ''}
          </InfoNote>
        </Section>
      )}
    </div>
  )
}

function TakeoffSections({
  takeoff,
  showMarkups,
}: {
  takeoff: NonNullable<Awaited<ReturnType<typeof getProjectEstimateComparison>>['takeoff']>
  showMarkups: boolean
}) {
  const { summary, alternates, clarifications } = takeoff
  const acceptedAlternates = alternates.filter((alternate) => alternate.accepted)
  const acceptedValue = acceptedAlternates.reduce((sum, alternate) => sum + alternate.amount, 0)

  return (
    <>
      <Section
        title="Takeoff"
        description="Every priced line, with the quantities behind it. Read-only here; the estimate itself stays locked as the historical record."
      >
        {summary.items.length === 0 ? (
          <EmptyState title="This estimate has no takeoff lines" />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th style={{ minWidth: '16rem' }}>Item</th>
                    <th>Section</th>
                    <th>Measure</th>
                    <th className="num">Net qty</th>
                    <th className="num">Gross qty</th>
                    <th className="num">Labor</th>
                    <th className="num">Material</th>
                    <th className="num">Equipment</th>
                    <th className="num">Subcontract</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.items.map((item) => (
                    <tr key={item.id}>
                      <td className="top">
                        <span className="block max-w-[22rem] truncate font-medium" style={{ color: 'var(--text)' }} title={item.description}>
                          {item.description}
                        </span>
                        {item.qaFlags.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {item.qaFlags.map((flag) => (
                              <Pill key={flag} tone="caution">{flag}</Pill>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.sectionName ?? '-'}</td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.measure}</td>
                      <td className="num">{fmtNumber(item.netQty, 2)}</td>
                      <td className="num">{fmtNumber(item.grossQty, 2)}</td>
                      <td className="num">{money(item.laborCost)}</td>
                      <td className="num">{money(item.materialCost)}</td>
                      <td className="num">{money(item.equipmentCost)}</td>
                      <td className="num">{money(item.subCost)}</td>
                      <td className="num font-medium">{money(item.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Takeoff total: {summary.items.length} lines</td>
                    <td className="num">{money(summary.items.reduce((sum, item) => sum + item.laborCost, 0))}</td>
                    <td className="num">{money(summary.items.reduce((sum, item) => sum + item.materialCost, 0))}</td>
                    <td className="num">{money(summary.items.reduce((sum, item) => sum + item.equipmentCost, 0))}</td>
                    <td className="num">{money(summary.items.reduce((sum, item) => sum + item.subCost, 0))}</td>
                    <td className="num">{money(summary.takeoffTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Section title="General conditions" description="The cost of running the job, priced separately from the takeoff">
          {summary.gcItems.length === 0 ? (
            <EmptyState title="No general conditions priced" />
          ) : (
            <div className="card-flush">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '12rem' }}>Item</th>
                      <th>Basis</th>
                      <th className="num">Quantity</th>
                      <th className="num">Unit cost</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.gcItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.item}</td>
                        <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.basis}</td>
                        <td className="num">{fmtNumber(item.qty, 2)}</td>
                        <td className="num">{money(item.unitCost, { cents: true })}</td>
                        <td className="num font-medium">{money(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>General conditions total</td>
                      <td className="num">{money(summary.gcTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </Section>

        {showMarkups && (
          <Section title="Markups" description="Every step compounded in order, showing exactly how the bid was reached">
            <div className="card-flush">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '14rem' }}>Step</th>
                      <th>Applied to</th>
                      <th className="num">Rate</th>
                      <th className="num">Amount</th>
                      <th className="num">Running total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.buildUp.steps.map((step, index) => (
                      <tr key={`${step.label}-${index}`} style={{ fontWeight: step.isSubtotal ? 600 : undefined }}>
                        <td>{step.label}</td>
                        <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{step.basis}</td>
                        <td className="num">{step.rate == null ? '-' : percent(step.rate, 2)}</td>
                        <td className="num">{money(step.amount)}</td>
                        <td className="num">
                          {step.isSubtotal ? <Calculated>{money(step.runningTotal)}</Calculated> : money(step.runningTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
        <Section
          title="Alternates"
          description="Priced options offered with the bid. Accepted alternates are part of the contract."
        >
          {alternates.length === 0 ? (
            <EmptyState title="No alternates were offered" />
          ) : (
            <>
              <div className="card-flush">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th style={{ minWidth: '16rem' }}>Description</th>
                        <th>Status</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alternates.map((alternate) => (
                        <tr key={alternate.id}>
                          <td className="font-medium">{alternate.number}</td>
                          <td className="wrap">{alternate.description}</td>
                          <td>
                            <Pill tone={alternate.accepted ? 'favorable' : 'neutral'}>
                              {alternate.accepted ? 'Accepted' : 'Not taken'}
                            </Pill>
                          </td>
                          <td className="num">{money(alternate.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>
                          Accepted: {acceptedAlternates.length} of {alternates.length}
                        </td>
                        <td className="num">{money(acceptedValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              {acceptedValue !== 0 && (
                <p className="mt-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
                  {moneyShort(acceptedValue)} of accepted alternates is carried inside the contract value.
                </p>
              )}
            </>
          )}
        </Section>

        <Section
          title="Exclusions and clarifications"
          description="What the price does not cover. Anything here that turns up on site is a change order, not a cost overrun."
        >
          {clarifications.length === 0 ? (
            <EmptyState
              title="Nothing was excluded"
              description="The bid was submitted without written qualifications."
            />
          ) : (
            <div className="card p-3.5">
              <ol className="space-y-2">
                {clarifications.map((clarification, index) => (
                  <li key={clarification.id} className="flex gap-2.5 text-xs">
                    <span className="tnum shrink-0 font-medium" style={{ color: 'var(--text-subtle)' }}>
                      {index + 1}.
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{clarification.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>
      </div>
    </>
  )
}
