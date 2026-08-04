import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { Section } from '@/components/ui'
import { TradeManager } from '@/components/admin/trade-manager'
import { DivisionForm } from '@/components/admin/division-form'
import { saveTrade, toggleTradeActive, saveDivision } from '../actions'

export const metadata = { title: 'Trades and divisions' }

export default async function TradesPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  const [trades, divisions] = await Promise.all([
    prisma.trade.findMany({
      where: { companyId: user.companyId },
      include: { division: true, _count: { select: { costCodes: true, budgetLines: true, vendors: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.csiDivision.findMany({
      where: { companyId: user.companyId },
      include: { _count: { select: { costCodes: true, trades: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <Section
        title="Trades and scopes"
        description="Rename, add or retire the scopes estimates and budgets are organised by. Retiring keeps existing history intact."
      >
        <TradeManager
          trades={trades.map((t) => ({
            id: t.id,
            name: t.name,
            divisionId: t.divisionId,
            divisionLabel: t.division ? `${t.division.code} ${t.division.name}` : null,
            active: t.active,
            costCodes: t._count.costCodes,
            budgetLines: t._count.budgetLines,
            vendors: t._count.vendors,
          }))}
          divisions={divisions.map((d) => ({ id: d.id, label: `${d.code} ${d.name}` }))}
          save={saveTrade}
          toggle={toggleTradeActive}
        />
      </Section>

      <Section title="CSI divisions" description="The division structure estimates and line items roll up to">
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="num">Trades</th>
                  <th className="num">Budget lines</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.code}</td>
                    <td>{d.name}</td>
                    <td className="num">{d._count.trades}</td>
                    <td className="num">{d._count.costCodes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DivisionForm action={saveDivision} />
      </Section>
    </div>
  )
}
