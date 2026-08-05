import Link from 'next/link'
import { forbidden, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getCompanyDashboard, parseProjectFilter } from '@/lib/queries/company'
import { prisma } from '@/lib/db'
import { buildWipSchedule, followUpState, rollupByDimension, sumBy, today } from '@/lib/finance'
import { date, money, month, percent, titleize } from '@/lib/format'
import { ExportMenu, PageHeader, Section, StatusPill, Variance } from '@/components/ui'
import { REPORT_TITLES, canOpenReport } from '@/lib/queries/report-spec'
import { ProjectFilters } from '@/components/dashboard/project-filters'
import { SavedViews } from '@/components/dashboard/saved-views'
import { listSavedViews } from '@/lib/queries/views'
import { saveView, deleteView } from '../../views-actions'

export const dynamicParams = false


export function generateStaticParams() {
  return Object.keys(REPORT_TITLES).map((slug) => ({ slug }))
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  const { slug } = await params
  const meta = REPORT_TITLES[slug]
  if (!meta) notFound()
  // The same gate the exports use, so a role can never read on screen what it
  // would be refused in a workbook.
  if (!canOpenReport(user.role, slug)) forbidden()

  const resolvedSearchParams = await searchParams
  const filter = parseProjectFilter(resolvedSearchParams)
  // The export must honour the filters on screen, or the workbook and the page
  // will show different projects.
  const query = (() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(resolvedSearchParams)) {
      if (typeof value === 'string' && value) params.set(key, value)
      else if (Array.isArray(value)) for (const v of value) params.append(key, v)
    }
    const encoded = params.toString()
    return encoded ? `?${encoded}` : ''
  })()
  const [data, savedViews] = await Promise.all([
    getCompanyDashboard(user.companyId, filter),
    listSavedViews(slug, user),
  ])
  const showMargins = can(user.role, 'view:margins')

  const bundles = data.projects
  // The date the financial figures are stated at, read from the data rather
  // than written into the page.
  const dataDate = data.asOf

  const header = (
    <PageHeader
      title={meta.title}
      subtitle={`${meta.description} · ${bundles.length} project${bundles.length === 1 ? '' : 's'} in view`}
      actions={
        <>
          <ExportMenu
            excelHref={`/api/export/report/${slug}${query}`}
            pdfHref={`/api/pdf/report/${slug}${query}`}
          />
          <Link href="/reports" className="btn btn-ghost">
            All reports
          </Link>
        </>
      }
    />
  )

  const filters = (
    <>
      <SavedViews scope={slug} views={savedViews} save={saveView} remove={deleteView} />
      <ProjectFilters
        options={data.filterOptions}
        current={filter}
        showCostTypes={slug === 'budget-vs-actual' || slug === 'committed'}
      />
    </>
  )

  // ── WIP ────────────────────────────────────────────────────────────────
  if (slug === 'wip') {
    const wip = buildWipSchedule(bundles)
    return (
      <>
        {header}
        {filters}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Project</th>
                  <th className="num">Contract value</th>
                  <th className="num">Forecast cost</th>
                  {showMargins && <th className="num">Forecast profit</th>}
                  {showMargins && <th className="num">Margin</th>}
                  <th className="num">Cost to date</th>
                  <th className="num">% complete</th>
                  <th className="num">Revenue earned</th>
                  <th className="num">Billed to date</th>
                  <th className="num">Overbilled</th>
                  <th className="num">Underbilled</th>
                  {showMargins && <th className="num">Profit earned</th>}
                </tr>
              </thead>
              <tbody>
                {wip.map((row) => (
                  <tr key={row.projectId}>
                    <td>
                      <Link href={`/projects/${row.projectId}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                        {row.number}
                      </Link>
                    </td>
                    <td className="max-w-[16rem] truncate">{row.name}</td>
                    <td className="num">{money(row.contractValue)}</td>
                    <td className="num">{money(row.forecastCost)}</td>
                    {showMargins && (
                      <td className="num">
                        <Variance value={row.forecastProfit} showSign={false} />
                      </td>
                    )}
                    {showMargins && <td className="num">{percent(row.forecastMargin)}</td>}
                    <td className="num">{money(row.costToDate)}</td>
                    <td className="num">{percent(row.pctComplete)}</td>
                    <td className="num">{money(row.revenueEarned)}</td>
                    <td className="num">{money(row.billedToDate)}</td>
                    <td className="num">{money(row.overbilled)}</td>
                    <td className="num" style={{ color: row.underbilled > 0 ? 'var(--caution)' : undefined }}>
                      {money(row.underbilled)}
                    </td>
                    {showMargins && <td className="num">{money(row.profitEarned)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total, {wip.length} projects</td>
                  <td className="num">{money(sumBy(wip, (r) => r.contractValue))}</td>
                  <td className="num">{money(sumBy(wip, (r) => r.forecastCost))}</td>
                  {showMargins && <td className="num">{money(sumBy(wip, (r) => r.forecastProfit))}</td>}
                  {showMargins && <td />}
                  <td className="num">{money(sumBy(wip, (r) => r.costToDate))}</td>
                  <td />
                  <td className="num">{money(sumBy(wip, (r) => r.revenueEarned))}</td>
                  <td className="num">{money(sumBy(wip, (r) => r.billedToDate))}</td>
                  <td className="num">{money(sumBy(wip, (r) => r.overbilled))}</td>
                  <td className="num">{money(sumBy(wip, (r) => r.underbilled))}</td>
                  {showMargins && <td className="num">{money(sumBy(wip, (r) => r.profitEarned))}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Budget vs actual and committed: line level ────────────────────────
  if (slug === 'budget-vs-actual' || slug === 'committed') {
    const rows = bundles.flatMap((p) =>
      p.financials.lines
        .filter((l) => !filter.costType?.length || filter.costType.includes(l.category))
        .map((l) => ({ project: p, line: l })),
    )
    const isCommitted = slug === 'committed'
    return (
      <>
        {header}
        {filters}
        <div className="card-flush mt-5">
          <div className="table-wrap" style={{ maxHeight: '44rem', overflowY: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Line item</th>
                  <th>Cost type</th>
                  <th className="num">Current budget</th>
                  <th className="num">Committed</th>
                  {isCommitted ? (
                    <>
                      <th className="num">Uncommitted budget</th>
                      <th className="num">Cost without commitment</th>
                      <th className="num">Commitment over budget</th>
                    </>
                  ) : (
                    <>
                      <th className="num">Actual</th>
                      <th className="num">% spent</th>
                      <th className="num">Forecast</th>
                      <th className="num">FAC variance</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ project, line }) => (
                  <tr key={`${project.id}-${line.costCodeId}`}>
                    <td>
                      <Link href={`/projects/${project.id}/budget`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                        {project.number}
                      </Link>
                    </td>
                    <td className="max-w-[20rem] truncate font-medium">{line.description}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{titleize(line.category)}</td>
                    <td className="num">{money(line.currentBudget)}</td>
                    <td className="num">{money(line.committed)}</td>
                    {isCommitted ? (
                      <>
                        <td className="num">{money(Math.max(0, line.currentBudget - line.committed))}</td>
                        <td className="num" style={{ color: line.committed === 0 && line.totalCostToDate > 0 ? 'var(--caution)' : undefined }}>
                          {line.committed === 0 ? money(line.totalCostToDate) : '-'}
                        </td>
                        <td className="num" style={{ color: line.committed > line.currentBudget ? 'var(--adverse)' : undefined }}>
                          {line.committed > line.currentBudget ? money(line.committed - line.currentBudget) : '-'}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num">{money(line.totalCostToDate)}</td>
                        <td className="num">{percent(line.pctSpent, 0)}</td>
                        <td className="num">{money(line.forecastAtCompletion)}</td>
                        <td className="num">
                          <Variance value={line.facVariance} />
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  if (slug === 'eac') {
    return (
      <>
        {header}
        {filters}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Project</th>
                  <th className="num">Current budget</th>
                  <th className="num">Cost to date</th>
                  <th className="num">Bottom-up EAC</th>
                  <th className="num">CPI-based EAC</th>
                  <th className="num">Budget-rate EAC</th>
                  <th>Method in use</th>
                  <th className="num">Selected EAC</th>
                  <th className="num">Estimate to complete</th>
                  <th className="num">Variance at completion</th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((p) => {
                  const f = p.financials
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/projects/${p.id}/forecast`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                          {p.number}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] truncate">{p.name}</td>
                      <td className="num">{money(f.currentBudget)}</td>
                      <td className="num">{money(f.totalCostToDate)}</td>
                      <td className="num">{money(f.eac.bottomUp)}</td>
                      <td className="num">{money(f.eac.cpiBased)}</td>
                      <td className="num">{money(f.eac.budgetRate)}</td>
                      <td>{titleize(f.eac.method)}</td>
                      <td className="num font-medium">{money(f.eac.selected)}</td>
                      <td className="num">{money(f.eac.estimateToComplete)}</td>
                      <td className="num">
                        <Variance value={f.eac.varianceAtCompletion} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.currentBudget))}</td>
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.totalCostToDate))}</td>
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.eac.bottomUp))}</td>
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.eac.cpiBased))}</td>
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.eac.budgetRate))}</td>
                  <td />
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.eac.selected))}</td>
                  <td className="num">{money(sumBy(bundles, (p) => p.financials.eac.estimateToComplete))}</td>
                  <td className="num">
                    <Variance value={sumBy(bundles, (p) => p.financials.eac.varianceAtCompletion)} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Profitability ──────────────────────────────────────────────────────
  if (slug === 'profitability') {
    const dims = (['pm', 'client', 'projectType'] as const).map((d) => ({
      dimension: d,
      label: d === 'pm' ? 'By project manager' : d === 'client' ? 'By client' : 'By project type',
      rows: rollupByDimension(bundles, d),
    }))
    return (
      <>
        {header}
        {filters}
        <div className="mt-5 space-y-6">
          <Section title="By project">
            <div className="card-flush">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Project</th>
                      <th>Manager</th>
                      <th className="num">Contract</th>
                      <th className="num">Forecast cost</th>
                      <th className="num">Forecast profit</th>
                      <th className="num">Margin</th>
                      <th className="num">Profit earned to date</th>
                      <th className="num">Backlog</th>
                      <th>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bundles.map((p) => {
                      const f = p.financials
                      return (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/projects/${p.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                              {p.number}
                            </Link>
                          </td>
                          <td className="max-w-[16rem] truncate">{p.name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{p.pmName ?? '-'}</td>
                          <td className="num">{money(f.contract.currentContract)}</td>
                          <td className="num">{money(f.forecastCost)}</td>
                          <td className="num">
                            <Variance value={f.forecastProfit} showSign={false} />
                          </td>
                          <td className="num">{percent(f.forecastMargin)}</td>
                          <td className="num">{money(f.forecastProfit * f.revenue.pctComplete)}</td>
                          <td className="num">{money(f.backlog)}</td>
                          <td>
                            <StatusPill status={f.health.flag} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          {dims.map((dim) => (
            <Section key={dim.dimension} title={dim.label}>
              <div className="card-flush">
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{dim.label.replace('By ', '')}</th>
                        <th className="num">Projects</th>
                        <th className="num">Contract value</th>
                        <th className="num">Cost to date</th>
                        <th className="num">Forecast profit</th>
                        <th className="num">Margin</th>
                        <th className="num">Backlog</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dim.rows.map((row) => (
                        <tr key={row.key}>
                          <td className="font-medium">{row.label}</td>
                          <td className="num">{row.projectCount}</td>
                          <td className="num">{money(row.contractValue)}</td>
                          <td className="num">{money(row.costToDate)}</td>
                          <td className="num">
                            <Variance value={row.forecastProfit} showSign={false} />
                          </td>
                          <td className="num">{percent(row.margin)}</td>
                          <td className="num">{money(row.backlog)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Section>
          ))}
        </div>
      </>
    )
  }

  // ── Billing position / backlog ─────────────────────────────────────────
  if (slug === 'billing-position' || slug === 'backlog') {
    return (
      <>
        {header}
        {filters}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Project</th>
                  <th className="num">Contract</th>
                  <th className="num">% complete</th>
                  <th className="num">Revenue earned</th>
                  <th className="num">Billed to date</th>
                  <th className="num">Overbilled</th>
                  <th className="num">Underbilled</th>
                  <th className="num">Collected</th>
                  <th className="num">AR</th>
                  <th className="num">Retention held</th>
                  <th className="num">Backlog</th>
                </tr>
              </thead>
              <tbody>
                {bundles.map((p) => {
                  const f = p.financials
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/projects/${p.id}/billing`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                          {p.number}
                        </Link>
                      </td>
                      <td className="max-w-[16rem] truncate">{p.name}</td>
                      <td className="num">{money(f.contract.currentContract)}</td>
                      <td className="num">{percent(f.revenue.pctComplete)}</td>
                      <td className="num">{money(f.revenue.revenueEarned)}</td>
                      <td className="num">{money(f.billing.totalCompletedAndStored)}</td>
                      <td className="num">{money(f.revenue.overbilled)}</td>
                      <td className="num" style={{ color: f.revenue.underbilled > 0 ? 'var(--caution)' : undefined }}>
                        {money(f.revenue.underbilled)}
                      </td>
                      <td className="num">{money(f.billing.amountCollected)}</td>
                      <td className="num">{money(f.billing.accountsReceivable)}</td>
                      <td className="num">{money(f.retentionReceivable)}</td>
                      <td className="num">{money(f.backlog)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>Total</td>
                  <td className="num">{money(data.totals.currentContract)}</td>
                  <td className="num">{percent(data.totals.weightedPctComplete)}</td>
                  <td className="num">{money(data.totals.revenueEarned)}</td>
                  <td className="num">{money(data.totals.billedToDate)}</td>
                  <td className="num">{money(data.totals.overbilled)}</td>
                  <td className="num">{money(data.totals.underbilled)}</td>
                  <td className="num">{money(data.totals.cashCollected)}</td>
                  <td className="num">{money(data.totals.accountsReceivable)}</td>
                  <td className="num">{money(data.totals.retentionReceivable)}</td>
                  <td className="num">{money(data.totals.backlog)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Company cash flow ──────────────────────────────────────────────────
  if (slug === 'cashflow') {
    return (
      <>
        {header}
        {filters}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Billings</th>
                  <th className="num">Collections</th>
                  <th className="num">Cost outflow</th>
                  <th className="num">Net cash</th>
                  <th className="num">Cumulative cash</th>
                </tr>
              </thead>
              <tbody>
                {data.cashFlow.map((r) => (
                  <tr key={r.periodEnd.toISOString()}>
                    <td className="font-medium">{month(r.periodEnd)}</td>
                    <td className="num">{money(r.billings)}</td>
                    <td className="num">{money(r.collections)}</td>
                    <td className="num">{money(r.costs)}</td>
                    <td className="num">
                      <Variance value={r.netCash} />
                    </td>
                    <td className="num" style={{ color: r.cumulativeCash < 0 ? 'var(--adverse)' : undefined }}>
                      {money(r.cumulativeCash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Subcontractor payments ─────────────────────────────────────────────
  if (slug === 'subcontractors') {
    const commitments = await prisma.commitment.findMany({
      where: { project: { companyId: user.companyId }, type: 'SUBCONTRACT' },
      include: { vendor: true, project: true, invoices: true, changes: true },
      orderBy: [{ project: { number: 'asc' } }, { number: 'asc' }],
    })
    return (
      <>
        {header}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Subcontractor</th>
                  <th>Contract</th>
                  <th className="num">Original</th>
                  <th className="num">Approved changes</th>
                  <th className="num">Current value</th>
                  <th className="num">% complete</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Paid</th>
                  <th className="num">Retention held</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Balance to complete</th>
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => {
                  const approved = c.changes.filter((ch) => ch.status === 'APPROVED').reduce((a, ch) => a + ch.amount, 0)
                  const current = c.originalAmount + approved
                  const invoiced = c.invoices.reduce((a, i) => a + i.amount, 0)
                  const paid = c.invoices.reduce((a, i) => a + i.amountPaid, 0)
                  const retention = c.invoices.reduce((a, i) => a + i.amount * i.retentionPct, 0)
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/projects/${c.projectId}/subs`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                          {c.project.number}
                        </Link>
                      </td>
                      <td className="font-medium">{c.vendor.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.number}</td>
                      <td className="num">{money(c.originalAmount)}</td>
                      <td className="num">{money(approved)}</td>
                      <td className="num">{money(current)}</td>
                      <td className="num">{percent(c.pctComplete, 0)}</td>
                      <td className="num">{money(invoiced)}</td>
                      <td className="num">{money(paid)}</td>
                      <td className="num">{money(retention)}</td>
                      <td className="num">{money(invoiced - retention - paid)}</td>
                      <td className="num">{money(current - current * c.pctComplete)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Change orders ──────────────────────────────────────────────────────
  if (slug === 'change-orders') {
    const changeOrderRows = (
      await Promise.all(
        bundles.map(async (project) => {
          const orders = await prisma.changeOrder.findMany({ where: { projectId: project.id }, orderBy: { number: 'asc' } })
          return orders.map((co) => ({ project, co }))
        }),
      )
    ).flat()

    return (
      <>
        {header}
        {filters}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="num">Owner amount</th>
                  <th className="num">Cost amount</th>
                  {showMargins && <th className="num">Margin</th>}
                  <th className="num">Probability</th>
                  <th>Initiated</th>
                  <th className="num">Days pending</th>
                </tr>
              </thead>
              <tbody>
                {changeOrderRows.map(({ project, co }) => (
                    <tr key={co.id}>
                      <td>
                        <Link href={`/projects/${project.id}/changes`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                          {project.number}
                        </Link>
                      </td>
                      <td className="font-medium">{co.number}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{titleize(co.type)}</td>
                      <td>
                        <StatusPill status={co.status} />
                      </td>
                      <td className="num">{money(co.ownerAmount)}</td>
                      <td className="num">{money(co.costAmount)}</td>
                      {showMargins && (
                        <td className="num">
                          <Variance value={co.ownerAmount - co.costAmount} showSign={false} />
                        </td>
                      )}
                      <td className="num">{percent(co.probabilityPct, 0)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(co.dateInitiated)}</td>
                      <td className="num">
                        {co.dateInitiated
                          ? Math.round(((co.dateApproved ?? dataDate).getTime() - co.dateInitiated.getTime()) / 86_400_000)
                          : '-'}
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Buyout ─────────────────────────────────────────────────────────────
  if (slug === 'buyout') {
    const packages = await prisma.bidPackage.findMany({
      where: { OR: [{ project: { companyId: user.companyId } }, { estimate: { companyId: user.companyId } }] },
      include: { project: true, estimate: true, awardedVendor: true },
      orderBy: { sortOrder: 'asc' },
    })
    return (
      <>
        {header}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Where</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th className="num">Budget</th>
                  <th className="num">Award</th>
                  <th className="num">Savings / (loss)</th>
                  <th>Awarded to</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.project ? (
                        <Link href={`/projects/${p.project.id}/buyout`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                          {p.project.number}
                        </Link>
                      ) : p.estimate ? (
                        <Link href={`/estimating/${p.estimate.id}/leveling`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                          Estimate: {p.estimate.name}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="font-medium">{p.name}</td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td className="num">{money(p.budgetAmount)}</td>
                    <td className="num">{money(p.awardAmount)}</td>
                    <td className="num">{p.awardAmount > 0 ? <Variance value={p.budgetAmount - p.awardAmount} /> : '-'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.awardedVendor?.name ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total awarded</td>
                  <td className="num">{money(sumBy(packages.filter((p) => p.awardAmount > 0), (p) => p.budgetAmount))}</td>
                  <td className="num">{money(sumBy(packages, (p) => p.awardAmount))}</td>
                  <td className="num">
                    <Variance value={sumBy(packages.filter((p) => p.awardAmount > 0), (p) => p.budgetAmount - p.awardAmount)} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Bid summaries ──────────────────────────────────────────────────────
  if (slug === 'bid-summary') {
    const { listEstimates } = await import('@/lib/queries/estimate')
    const estimates = await listEstimates(user.companyId)
    return (
      <>
        {header}
        <div className="card-flush mt-5">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Estimate</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th className="num">Direct cost</th>
                  <th className="num">Total bid</th>
                  <th className="num">Margin</th>
                  <th>Converted</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/estimating/${e.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                        {e.name} v{e.version}
                      </Link>
                    </td>
                    <td>
                      <StatusPill status={e.status} />
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{date(e.bidDueDate)}</td>
                    <td className="num">{money(e.directCost)}</td>
                    <td className="num font-medium">{money(e.totalBid)}</td>
                    <td className="num">{percent(e.margin)}</td>
                    <td>{e.projects[0]?.number ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    )
  }

  // ── Pipeline ───────────────────────────────────────────────────────────
  const asOf = today()
  return (
    <>
      {header}
      <div className="card-flush mt-5">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Bid</th>
                <th>Opportunity</th>
                <th>Status</th>
                <th className="num">Value</th>
                <th className="num">Probability</th>
                <th className="num">Weighted</th>
                <th>Follow-up</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.pipelineRows.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.number}</td>
                  <td className="max-w-[18rem] truncate">{r.name}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td className="num">{money(r.submittedAmount || r.estimatedValue)}</td>
                  <td className="num">{percent(r.winProbability, 0)}</td>
                  <td className="num">{money((r.submittedAmount || r.estimatedValue) * r.winProbability)}</td>
                  <td>{followUpState(r, asOf)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{date(r.decisionDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
