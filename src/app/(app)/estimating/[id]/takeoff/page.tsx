import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { getEquipmentItems } from '@/lib/queries/equipment'
import { prisma } from '@/lib/db'
import { number as fmtNumber, percent } from '@/lib/format'
import { KpiGrid, Kpi, MoneyKpi, Section } from '@/components/ui'
import { TakeoffTable } from '@/components/estimating/takeoff-table'
import { saveTakeoffItem, deleteTakeoffItem } from '../actions'

export default async function TakeoffPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) notFound()

  const { estimate, summary, laborRates } = bundle
  const canEdit = can(user.role, 'edit:estimates') && !estimate.lockedAt

  const [divisions, equipment] = await Promise.all([
    prisma.csiDivision.findMany({
      where: { companyId: user.companyId },
      orderBy: { sortOrder: 'asc' },
    }),
    getEquipmentItems(user.companyId),
  ])

  const flagged = summary.items.filter((i) => i.qaFlags.length > 0)

  return (
    <div className="space-y-6">
      <Section title="Takeoff position">
        <KpiGrid cols={6}>
          <MoneyKpi label="Takeoff total" amount={summary.takeoffTotal} detail={`${summary.items.length} lines`} />
          <MoneyKpi label="Labor" amount={summary.costMix.labor} detail={`${fmtNumber(summary.laborHours, 0)} hours`} />
          <MoneyKpi label="Material" amount={summary.costMix.material} detail={`Taxed at ${percent(estimate.salesTaxPct, 1)}`} />
          <MoneyKpi
            label="Equipment"
            amount={summary.costMix.equipment}
            detail={`${fmtNumber(summary.items.reduce((total, item) => total + item.equipmentHours, 0), 0)} machine hours`}
          />
          <MoneyKpi label="Subcontract" amount={summary.costMix.subcontract} />
          <Kpi
            label="Lines flagged by QA"
            value={flagged.length.toString()}
            tone={flagged.length > 0 ? 'caution' : 'favorable'}
            detail={flagged.length > 0 ? 'Fix before submitting' : 'All clear'}
          />
        </KpiGrid>
      </Section>

      <Section
        title="Quantity takeoff"
        description={`Labor is burdened at ${percent(estimate.laborBurdenPct, 1)} and material taxed at ${percent(estimate.salesTaxPct, 1)}. Quantity derives from the measure and dimensions; waste inflates it.`}
      >
        <TakeoffTable
          estimateId={estimate.id}
          items={summary.items}
          sections={estimate.sections.map((s) => ({ id: s.id, label: s.name }))}
          divisions={divisions.map((d) => ({ id: d.id, code: d.code, label: `${d.code} ${d.name}` }))}
          laborClasses={laborRates.map((r) => ({ className: r.className, rate: r.rate }))}
          equipmentClasses={equipment
            .filter((machine) => machine.active)
            .map((machine) => ({ name: machine.name, rate: machine.loadedHourlyCost }))}
          canEdit={canEdit}
          save={saveTakeoffItem}
          remove={deleteTakeoffItem}
          locked={estimate.lockedAt != null}
        />
      </Section>
    </div>
  )
}
