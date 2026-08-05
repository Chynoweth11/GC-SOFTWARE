import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { COST_CATEGORIES, CATEGORY_LABELS, COST_TYPE_DESCRIPTIONS } from '@/lib/cost-types'
import { money, number } from '@/lib/format'
import { InfoNote, Section } from '@/components/ui'
import type { CostCategory } from '@/generated/prisma/client'

export const metadata = { title: 'Cost types' }

export default async function CostTypesPage() {
  const user = await requireUser()

  // Cost and commitment lines carry their cost type through the line identity
  // record, so both are grouped by that and folded back into the eight types.
  const [budgetGroups, costGroups, commitmentGroups, identities] = await Promise.all([
    prisma.budgetLine.groupBy({
      by: ['category'],
      where: { project: { companyId: user.companyId } },
      _count: true,
      _sum: { originalBudget: true },
    }),
    prisma.costTransaction.groupBy({
      by: ['costCodeId'],
      where: { project: { companyId: user.companyId }, deletedAt: null },
      _sum: { amount: true },
    }),
    prisma.commitmentLine.groupBy({
      by: ['costCodeId'],
      where: { commitment: { project: { companyId: user.companyId } } },
      _sum: { amount: true },
    }),
    prisma.costCode.findMany({ where: { companyId: user.companyId }, select: { id: true, category: true } }),
  ])

  const categoryOf = new Map(identities.map((identity) => [identity.id, identity.category]))

  const fold = (groups: { costCodeId: string; _sum: { amount: number | null } }[]) => {
    const totals = new Map<CostCategory, number>()
    for (const group of groups) {
      const category = categoryOf.get(group.costCodeId)
      if (!category) continue
      totals.set(category, (totals.get(category) ?? 0) + (group._sum.amount ?? 0))
    }
    return totals
  }

  const costByType = fold(costGroups)
  const committedByType = fold(commitmentGroups)

  const rows = COST_CATEGORIES.map((category) => {
    const budgetGroup = budgetGroups.find((group) => group.category === category)
    return {
      category,
      label: CATEGORY_LABELS[category],
      description: COST_TYPE_DESCRIPTIONS[category],
      lines: budgetGroup?._count ?? 0,
      budget: budgetGroup?._sum.originalBudget ?? 0,
      cost: costByType.get(category) ?? 0,
      committed: committedByType.get(category) ?? 0,
    }
  })

  const totals = rows.reduce(
    (acc, row) => ({
      lines: acc.lines + row.lines,
      budget: acc.budget + row.budget,
      cost: acc.cost + row.cost,
      committed: acc.committed + row.committed,
    }),
    { lines: 0, budget: 0, cost: 0, committed: 0 },
  )

  return (
    <div className="space-y-4">
      <Section
        title="Cost types"
        description="One shared vocabulary for every line item, on every project. Estimates, budgets, cost, commitments and reports all group by these."
      >
        <InfoNote>
          These eight are fixed on purpose. Keeping the list short and general is what lets you compare a line on one
          job with the same line on another, and what makes every roll-up add to the same total. Assign a cost type to
          each line item when you create it, and filter by it anywhere you see the Cost type control.
        </InfoNote>
      </Section>

      <div className="card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: '11rem' }}>Cost type</th>
                <th>What belongs here</th>
                <th className="num" style={{ width: '7rem' }}>Line items</th>
                <th className="num" style={{ width: '9rem' }}>Original budget</th>
                <th className="num" style={{ width: '9rem' }}>Committed</th>
                <th className="num" style={{ width: '9rem' }}>Cost to date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.category}>
                  <td className="font-medium" style={{ color: 'var(--text)' }}>{row.label}</td>
                  <td className="text-xs" style={{ color: 'var(--text-muted)' }}>{row.description}</td>
                  <td className="num">{number(row.lines)}</td>
                  <td className="num">{money(row.budget)}</td>
                  <td className="num">{money(row.committed)}</td>
                  <td className="num">{money(row.cost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>All cost types</td>
                <td className="num">{number(totals.lines)}</td>
                <td className="num">{money(totals.budget)}</td>
                <td className="num">{money(totals.committed)}</td>
                <td className="num">{money(totals.cost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
