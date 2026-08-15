import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { prisma } from '@/lib/db'
import { hours, money, moneyShort, number as fmtNumber, percent } from '@/lib/format'
import { DataList, KpiGrid, Kpi, MoneyKpi, Section, Variance, InfoNote } from '@/components/ui'
import { ChartFrame, DonutChart, HorizontalBars } from '@/components/charts/primitives'
import { ConvertToProjectForm } from '@/components/estimating/convert-to-project-form'
import { convertEstimateToProject } from './actions'

export default async function BidSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) notFound()

  const { estimate, summary } = bundle
  const showMarkups = can(user.role, 'view:markups')
  const canAward = can(user.role, 'award:bid')
  const build = summary.buildUp

  const clients = canAward ? await prisma.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } }) : []
  const managers = canAward ? await prisma.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: 'asc' } }) : []

  return (
    <div className="space-y-6">
      <Section title="Bid position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Direct cost" amount={summary.directCost} detail={<>Takeoff {moneyShort(summary.takeoffTotal)} · GCs {moneyShort(summary.gcTotal)}</>} />
          {showMarkups && <MoneyKpi label="Cost subtotal" amount={build.costSubtotal} detail="After small tools and contingency" />}
          {showMarkups && <MoneyKpi label="Overhead and profit" amount={build.overhead + build.profit} />}
          <MoneyKpi label="Total bid" amount={build.roundedBid} tone="favorable" detail={`Rounded from ${money(build.totalBid)}`} />
          {showMarkups && (
            <Kpi
              label="Gross margin on bid"
              value={percent(build.grossMarginOnBid)}
              tone={build.grossMarginOnBid < 0.1 ? 'caution' : 'favorable'}
            />
          )}
          <Kpi
            label="Cost per square foot"
            value={summary.metrics.buildingAreaSf ? money(summary.metrics.totalBidPerSf, { cents: true }) : '-'}
            detail={summary.metrics.buildingAreaSf ? `${fmtNumber(summary.metrics.buildingAreaSf)} SF` : 'No area entered'}
          />
        </KpiGrid>
      </Section>

      {summary.qa.issues.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2.5 text-xs"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
        >
          <strong>Clear these before the bid leaves the building:</strong>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {summary.qa.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {showMarkups && (
          <div className="card-flush xl:col-span-2">
            <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                Bid build-up
              </h3>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                Every step, compounded in order: exactly how the final number was reached
              </p>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Applied to</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                    <th className="num">Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {build.steps.map((step, i) => (
                    <tr
                      key={`${step.label}-${i}`}
                      style={step.isSubtotal ? { background: 'var(--surface-inset)', fontWeight: 600 } : undefined}
                    >
                      <td>{step.label}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{step.basis}</td>
                      <td className="num">{step.rate == null ? '-' : percent(step.rate, 2)}</td>
                      <td className="num">{money(step.amount)}</td>
                      <td className="num">{money(step.runningTotal)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--accent-soft)', fontWeight: 600 }}>
                    <td colSpan={3}>Rounded bid (nearest {money(estimate.roundToNearest)})</td>
                    <td className="num" style={{ color: 'var(--accent)' }}>
                      {money(build.roundedBid)}
                    </td>
                    <td className="num">{money(build.roundedBid - build.totalBid)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <ChartFrame title="Cost mix" subtitle="Where the direct cost sits">
            <DonutChart
              format="moneyShort"
              centerLabel="Direct cost"
              centerValue={moneyShort(summary.directCost)}
              slices={[
                { label: 'Labor', value: summary.costMix.labor },
                { label: 'Material', value: summary.costMix.material },
                { label: 'Equipment', value: summary.costMix.equipment },
                { label: 'Subcontract', value: summary.costMix.subcontract },
                { label: 'General conditions', value: summary.gcTotal },
              ].filter((s) => s.value > 0)}
            />
          </ChartFrame>

          <ChartFrame title="Bid metrics">
            <DataList
              columns={1}
              items={[
                { label: 'Building area', value: summary.metrics.buildingAreaSf ? `${fmtNumber(summary.metrics.buildingAreaSf)} SF` : '-' },
                { label: 'Direct cost / SF', value: summary.metrics.buildingAreaSf ? money(summary.metrics.directCostPerSf, { cents: true }) : '-' },
                { label: 'Total bid / SF', value: summary.metrics.buildingAreaSf ? money(summary.metrics.totalBidPerSf, { cents: true }) : '-' },
                { label: 'Labor share of direct', value: percent(summary.metrics.laborShareOfDirect) },
                { label: 'Subcontract share of direct', value: percent(summary.metrics.subShareOfDirect) },
                { label: 'Total labor hours', value: hours(summary.laborHours) },
              ]}
            />
          </ChartFrame>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Direct cost by trade section">
          <HorizontalBars
            labels={summary.bySection.map((s) => s.label)}
            format="moneyShort"
            maxRows={14}
            series={[{ key: 'amount', label: 'Direct cost', values: summary.bySection.map((s) => s.amount) }]}
          />
        </ChartFrame>

        <ChartFrame title="Direct cost by CSI division">
          <HorizontalBars
            labels={summary.byDivision.map((d) => d.label)}
            format="moneyShort"
            maxRows={14}
            series={[{ key: 'amount', label: 'Direct cost', values: summary.byDivision.map((d) => d.amount) }]}
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="By trade section">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th className="num">Amount</th>
                    <th className="num">% of direct</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.bySection.map((s) => (
                    <tr key={s.key}>
                      <td>{s.label}</td>
                      <td className="num">{money(s.amount)}</td>
                      <td className="num">{percent(s.pctOfDirect, 1)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Direct cost total</td>
                    <td className="num">{money(summary.directCost)}</td>
                    <td className="num">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Section>

        <Section title="By CSI division">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Division</th>
                    <th className="num">Amount</th>
                    <th className="num">% of direct</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byDivision.map((d) => (
                    <tr key={d.key}>
                      <td>{d.label}</td>
                      <td className="num">{money(d.amount)}</td>
                      <td className="num">{percent(d.pctOfDirect, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </div>

      {estimate.alternates.length > 0 && (
        <Section title="Alternates" description="Priced separately from the base bid">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Alternate</th>
                    <th>Description</th>
                    <th className="num">Add / (deduct)</th>
                    <th className="num">Bid if accepted</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.alternates.map((a) => (
                    <tr key={a.id}>
                      <td className="font-medium">{a.number}</td>
                      <td>{a.description}</td>
                      <td className="num">
                        <Variance value={a.amount} favorableWhen="negative" />
                      </td>
                      <td className="num">{money(build.roundedBid + a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {estimate.clarifications.length > 0 && (
        <Section title="Clarifications and exclusions" description="Goes on the bid form">
          <div className="card p-4">
            <ol className="list-inside list-decimal space-y-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {estimate.clarifications.map((c) => (
                <li key={c.id}>{c.text}</li>
              ))}
            </ol>
          </div>
        </Section>
      )}

      {estimate.projects.length > 0 ? (
        <InfoNote>
          This estimate has been converted to project{' '}
          <Link href={`/projects/${estimate.projects[0].id}`} className="underline">
            {estimate.projects[0].number}: {estimate.projects[0].name}
          </Link>
          . The estimate is preserved as a locked historical record.
        </InfoNote>
      ) : (
        canAward && (
          <Section
            title="Convert to a project"
            description="Creates the project, its original contract value, the budget by line item and the opening cash-flow curve: the estimate stays locked as the historical record."
          >
            <ConvertToProjectForm
              estimateId={estimate.id}
              defaultContract={build.roundedBid}
              defaultName={estimate.name}
              clients={clients.map((c) => ({ id: c.id, label: c.name }))}
              managers={managers.map((m) => ({ id: m.id, label: m.name }))}
              sections={summary.bySection.map((s) => ({ key: s.key, label: s.label, amount: s.amount }))}
              action={convertEstimateToProject}
            />
          </Section>
        )
      )}
    </div>
  )
}
