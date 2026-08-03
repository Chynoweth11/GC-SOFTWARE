import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { rollupBy, sumBy } from '@/lib/finance'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import { money, moneyShort, month, percent } from '@/lib/format'
import { KpiGrid, MoneyKpi, Section, Variance, InfoNote } from '@/components/ui'
import { ChartFrame, BarChart, DonutChart, HorizontalBars } from '@/components/charts/primitives'
import { CostLedger } from '@/components/project/cost-ledger'
import { CostEntryForm } from '@/components/project/cost-entry-form'
import { createCostTransaction, recodeTransaction, splitTransaction, softDeleteTransaction } from './actions'

export default async function CostsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f } = bundle
  const canEdit = can(user.role, 'edit:costs')

  const [transactions, costCodes, vendors, commitments] = await Promise.all([
    prisma.costTransaction.findMany({
      where: { projectId: id, deletedAt: null },
      include: { costCode: true, vendor: true, commitment: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.costCode.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { code: 'asc' } }),
    prisma.vendor.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } }),
    prisma.commitment.findMany({ where: { projectId: id }, include: { vendor: true }, orderBy: { number: 'asc' } }),
  ])

  const uncoded = transactions.filter((t) => t.needsCoding)

  // Duplicate detection: same vendor, amount and date is almost always a re-import.
  const seen = new Map<string, number>()
  for (const t of transactions) {
    const key = `${t.vendorId ?? 'none'}|${t.amount.toFixed(2)}|${t.date.toISOString().slice(0, 10)}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const duplicateKeys = new Set([...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key))
  const duplicates = transactions.filter((t) =>
    duplicateKeys.has(`${t.vendorId ?? 'none'}|${t.amount.toFixed(2)}|${t.date.toISOString().slice(0, 10)}`),
  )

  // Monthly spend from the ledger itself.
  const byMonth = new Map<string, { periodEnd: Date; actual: number; accrual: number }>()
  for (const t of transactions) {
    const periodEnd = new Date(Date.UTC(t.date.getUTCFullYear(), t.date.getUTCMonth() + 1, 0))
    const key = periodEnd.toISOString().slice(0, 7)
    const entry = byMonth.get(key) ?? { periodEnd, actual: 0, accrual: 0 }
    if (t.type === 'ACCRUAL') entry.accrual += t.amount
    else entry.actual += t.amount
    byMonth.set(key, entry)
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())

  const byTrade = rollupBy(f.lines, (l) => ({
    key: l.tradeName ?? l.category,
    label: l.tradeName ?? CATEGORY_LABELS[l.category],
  }))

  const byVendor = new Map<string, number>()
  for (const t of transactions) {
    if (!t.vendor) continue
    byVendor.set(t.vendor.name, (byVendor.get(t.vendor.name) ?? 0) + t.amount)
  }
  const vendorRows = [...byVendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  return (
    <div className="space-y-6">
      <Section title="Cost position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Actual cost" amount={f.costToDate} detail={`${transactions.filter((t) => t.type === 'ACTUAL').length} transactions`} />
          <MoneyKpi label="Accruals" amount={f.accruals} hint="Work in place not yet invoiced." />
          <MoneyKpi label="Total cost to date" amount={f.totalCostToDate} />
          <MoneyKpi label="Committed" amount={f.committed} detail={<>Remaining {moneyShort(f.remainingCommitment)}</>} />
          <MoneyKpi label="Current budget" amount={f.currentBudget} />
          <MoneyKpi
            label="Remaining budget"
            amount={f.remainingBudget}
            tone={f.remainingBudget < 0 ? 'adverse' : 'neutral'}
            detail={percent(f.totalCostToDate / (f.currentBudget || 1))}
          />
        </KpiGrid>
      </Section>

      {(uncoded.length > 0 || duplicates.length > 0) && (
        <div className="space-y-2">
          {uncoded.length > 0 && (
            <InfoNote>
              {uncoded.length} imported transaction{uncoded.length === 1 ? '' : 's'} still need coding. Filter to “Needs coding” below to
              assign them.
            </InfoNote>
          )}
          {duplicates.length > 0 && (
            <div
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
            >
              {duplicates.length} transaction{duplicates.length === 1 ? '' : 's'} share a vendor, amount and date with another row —
              likely a duplicated import. They are flagged in the ledger.
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartFrame title="Cost by month" subtitle="Posted actuals and accruals from the ledger" className="xl:col-span-2">
          <BarChart
            labels={monthly.map((m) => month(m.periodEnd))}
            height={230}
            format="moneyShort"
            stacked
            series={[
              { key: 'actual', label: 'Actual', values: monthly.map((m) => m.actual), color: 'var(--accent)' },
              { key: 'accrual', label: 'Accrual', values: monthly.map((m) => m.accrual), color: 'var(--caution)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Cost by category">
          <DonutChart
            format="moneyShort"
            centerLabel="Cost to date"
            centerValue={moneyShort(f.totalCostToDate)}
            slices={f.categories.filter((c) => c.costToDate > 0).map((c) => ({ label: CATEGORY_LABELS[c.category], value: c.costToDate }))}
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame title="Budget vs actual vs forecast by trade">
          <HorizontalBars
            labels={byTrade.map((t) => t.label)}
            format="moneyShort"
            series={[
              { key: 'budget', label: 'Current budget', values: byTrade.map((t) => t.currentBudget) },
              { key: 'actual', label: 'Cost to date', values: byTrade.map((t) => t.costToDate), color: 'var(--caution)' },
              { key: 'forecast', label: 'Forecast', values: byTrade.map((t) => t.forecastAtCompletion), color: 'var(--adverse)' },
            ]}
          />
        </ChartFrame>

        <ChartFrame title="Cost by vendor" subtitle="Top ten by posted cost">
          <HorizontalBars
            labels={vendorRows.map(([name]) => name)}
            format="moneyShort"
            series={[{ key: 'cost', label: 'Cost to date', values: vendorRows.map(([, amount]) => amount) }]}
          />
        </ChartFrame>
      </div>

      {canEdit && (
        <Section title="Post a cost" description="Manual entries and corrections. Imported transactions land in the same ledger.">
          <CostEntryForm
            projectId={project.id}
            costCodes={costCodes.map((c) => ({ id: c.id, label: `${c.code} — ${c.description}` }))}
            vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
            commitments={commitments.map((c) => ({ id: c.id, label: `${c.number} — ${c.vendor.name}` }))}
            action={createCostTransaction}
          />
        </Section>
      )}

      <Section
        title="Cost ledger"
        description={`${transactions.length} transactions · ${money(sumBy(transactions, (t) => t.amount))} posted`}
      >
        <CostLedger
          projectId={project.id}
          transactions={transactions.map((t) => ({
            id: t.id,
            date: t.date.toISOString(),
            type: t.type,
            source: t.source,
            costCode: t.costCode.code,
            costCodeId: t.costCodeId,
            description: t.description,
            reference: t.reference,
            vendorName: t.vendor?.name ?? null,
            commitmentNumber: t.commitment?.number ?? null,
            amount: t.amount,
            hours: t.hours,
            needsCoding: t.needsCoding,
            notes: t.notes,
            isDuplicate: duplicateKeys.has(
              `${t.vendorId ?? 'none'}|${t.amount.toFixed(2)}|${t.date.toISOString().slice(0, 10)}`,
            ),
          }))}
          costCodes={costCodes.map((c) => ({ id: c.id, label: `${c.code} — ${c.description}` }))}
          canEdit={canEdit}
          recode={canEdit ? recodeTransaction : undefined}
          split={canEdit ? splitTransaction : undefined}
          remove={canEdit ? softDeleteTransaction : undefined}
        />
      </Section>
    </div>
  )
}
