import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import { rollupBy } from '@/lib/finance'
import { date, money, moneyShort, percent, titleize } from '@/lib/format'
import { KpiGrid, MoneyKpi, Section, Variance, EmptyState } from '@/components/ui'
import { ChartFrame, HorizontalBars, Meter } from '@/components/charts/primitives'
import { BudgetTable } from '@/components/project/budget-table'
import { BudgetTransferForm } from '@/components/project/budget-transfer-form'
import { BudgetLineForm, type BudgetLineOption } from '@/components/project/budget-line-form'
import { transferBudget, reviseBudget, addBudgetLine, deleteBudgetLine } from './actions'

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f } = bundle
  const canEdit = can(user.role, 'edit:budget')

  const [budgetLines, revisions, allCodes, costCounts, commitmentCounts] = await Promise.all([
    prisma.budgetLine.findMany({
      where: { projectId: id },
      include: { costCode: { include: { division: true } }, trade: true },
      orderBy: [{ sortOrder: 'asc' }],
    }),
    prisma.budgetRevision.findMany({
      where: { projectId: id },
      include: { budgetLine: { include: { costCode: true } }, changeOrder: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.costCode.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { code: 'asc' } }),
    prisma.costTransaction.groupBy({ by: ['costCodeId'], where: { projectId: id, deletedAt: null }, _count: true }),
    prisma.commitmentLine.groupBy({ by: ['costCodeId'], where: { commitment: { projectId: id } }, _count: true }),
  ])

  // A line can only be removed while nothing points at it.
  const costedCodes = new Set(costCounts.map((c) => c.costCodeId))
  const committedCodes = new Set(commitmentCounts.map((c) => c.costCodeId))
  const revisedLines = new Set(revisions.map((r) => r.budgetLineId))
  const onBudget = new Set(budgetLines.map((l) => l.costCodeId))
  const budgetLineOptions: BudgetLineOption[] = budgetLines.map((line) => {
    const blocked =
      costedCodes.has(line.costCodeId) || committedCodes.has(line.costCodeId) || revisedLines.has(line.id)
    return {
      budgetLineId: line.id,
      code: line.costCode.code,
      description: line.description,
      originalBudget: line.originalBudget,
      removable: !blocked,
      blockedBecause: blocked ? 'This code carries cost, a commitment or a revision' : null,
    }
  })
  const availableCodes = allCodes
    .filter((c) => !onBudget.has(c.id))
    .map((c) => ({ id: c.id, label: `${c.code} ${c.description}` }))

  const byDivision = rollupBy(f.lines, (l) => ({
    key: l.divisionCode ?? '-',
    label: l.divisionCode ? `${l.divisionCode} ${l.divisionName ?? ''}`.trim() : 'Unassigned division',
  }))

  const lineOptions = budgetLines.map((l) => ({
    id: l.id,
    label: `${l.costCode.code} ${l.description}`,
  }))

  return (
    <div className="space-y-6">
      <Section title="Budget position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Original budget" amount={f.originalBudget} hint="The budget set at award, never overwritten." />
          <MoneyKpi
            label="Revisions"
            amount={f.currentBudget - f.originalBudget}
            tone={f.currentBudget - f.originalBudget > 0 ? 'caution' : 'neutral'}
            detail={`${revisions.length} posting${revisions.length === 1 ? '' : 's'}`}
          />
          <MoneyKpi label="Current budget" amount={f.currentBudget} />
          <MoneyKpi label="Committed" amount={f.committed} detail={percent(f.committed / (f.currentBudget || 1))} />
          <MoneyKpi label="Cost to date" amount={f.totalCostToDate} detail={percent(f.totalCostToDate / (f.currentBudget || 1))} />
          <MoneyKpi
            label="Forecast at completion"
            amount={f.forecastCost}
            tone={f.eac.varianceAtCompletion < 0 ? 'adverse' : 'favorable'}
            detail={<Variance value={f.eac.varianceAtCompletion} compact />}
          />
        </KpiGrid>
      </Section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Budget by CSI division" subtitle="Current budget, cost to date and forecast">
          <HorizontalBars
            labels={byDivision.map((d) => d.label)}
            format="moneyShort"
            series={[
              { key: 'budget', label: 'Current budget', values: byDivision.map((d) => d.currentBudget) },
              { key: 'cost', label: 'Cost to date', values: byDivision.map((d) => d.costToDate), color: 'var(--caution)' },
              { key: 'forecast', label: 'Forecast', values: byDivision.map((d) => d.forecastAtCompletion), color: 'var(--adverse)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Budget consumption by category" subtitle="Cost to date against current budget">
          <div className="space-y-3">
            {f.categories.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>{CATEGORY_LABELS[c.category]}</span>
                  <span className="tnum" style={{ color: 'var(--text)' }}>
                    {moneyShort(c.costToDate)} <span style={{ color: 'var(--text-subtle)' }}>of {moneyShort(c.currentBudget)}</span>
                  </span>
                </div>
                <Meter
                  value={c.currentBudget ? c.costToDate / c.currentBudget : 0}
                  tone={c.forecastAtCompletion > c.currentBudget ? 'adverse' : 'accent'}
                  showLabel={false}
                />
              </div>
            ))}
          </div>
        </ChartFrame>
      </div>

      <Section
        title="Cost control"
        description="One row per cost code. Original budget, revisions, commitment, cost, earned value and forecast: the whole project P&L is built here."
      >
        <BudgetTable
          lines={f.lines}
          canEdit={canEdit}
          reviseBudget={canEdit ? reviseBudget : undefined}
          projectId={project.id}
          budgetLineIdByCostCode={Object.fromEntries(budgetLines.map((l) => [l.costCodeId, l.id]))}
        />
      </Section>

      {canEdit && (
        <Section
          title="Budget lines"
          description="Adds a cost code to this job. A code with nothing booked against it can also be removed."
        >
          <BudgetLineForm
            projectId={project.id}
            availableCodes={availableCodes}
            lines={budgetLineOptions}
            add={addBudgetLine}
            remove={deleteBudgetLine}
            canDelete={can(user.role, 'delete:records')}
          />
        </Section>
      )}

      {canEdit && (
        <Section
          title="Budget transfer"
          description="Moves budget between cost codes. Both halves are recorded as revisions so the original budget is never overwritten."
        >
          <BudgetTransferForm lines={lineOptions} action={transferBudget} projectId={project.id} />
        </Section>
      )}

      <Section title="Revision history" description="Every change to the budget, in order, with its reason">
        {revisions.length === 0 ? (
          <EmptyState
            title="No budget revisions yet"
            description="Approved change orders and manual transfers will appear here as an unbroken audit trail."
          />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Cost code</th>
                    <th>Type</th>
                    <th>Reason</th>
                    <th>Change order</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((r) => (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{date(r.createdAt)}</td>
                      <td className="font-medium">{r.budgetLine.costCode.code}</td>
                      <td>{titleize(r.type)}</td>
                      <td className="max-w-[26rem] truncate" title={r.reason} style={{ color: 'var(--text-muted)' }}>
                        {r.reason}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.changeOrder?.number ?? '-'}</td>
                      <td className="num">
                        <Variance value={r.amount} favorableWhen="negative" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Net revisions</td>
                    <td className="num">{money(f.currentBudget - f.originalBudget)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
