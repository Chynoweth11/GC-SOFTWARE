import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { COST_CATEGORIES, CATEGORY_LABELS } from '@/lib/finance/cost'
import { EmptyState, Section } from '@/components/ui'
import { CostCodeManager } from '@/components/admin/cost-code-manager'
import { saveCostCode, toggleCostCodeActive } from '../actions'

export const metadata = { title: 'Cost codes' }

export default async function CostCodesPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  const [costCodes, divisions, trades] = await Promise.all([
    prisma.costCode.findMany({
      where: { companyId: user.companyId },
      include: {
        division: true,
        trade: true,
        _count: { select: { budgetLines: true, costTx: true, commitmentLines: true } },
      },
      orderBy: { code: 'asc' },
    }),
    prisma.csiDivision.findMany({ where: { companyId: user.companyId }, orderBy: { sortOrder: 'asc' } }),
    prisma.trade.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: 'asc' } }),
  ])

  return (
    <div className="space-y-6">
      <Section
        title="Cost codes"
        description="The spine of the whole system: budgets, commitments, cost and forecasts all hang off these. Retiring a code keeps its history intact; codes are never deleted."
      >
        {costCodes.length === 0 ? (
          <EmptyState title="No cost codes yet" description="Add the first one below." />
        ) : (
          <CostCodeManager
            costCodes={costCodes.map((c) => ({
              id: c.id,
              code: c.code,
              description: c.description,
              category: c.category,
              divisionId: c.divisionId,
              divisionLabel: c.division ? `${c.division.code} ${c.division.name}` : null,
              tradeId: c.tradeId,
              tradeName: c.trade?.name ?? null,
              active: c.active,
              inUse: c._count.budgetLines + c._count.costTx + c._count.commitmentLines,
            }))}
            divisions={divisions.map((d) => ({ id: d.id, label: `${d.code} ${d.name}` }))}
            trades={trades.map((t) => ({ id: t.id, label: t.name }))}
            categories={COST_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
            save={saveCostCode}
            toggle={toggleCostCodeActive}
          />
        )}
      </Section>
    </div>
  )
}
