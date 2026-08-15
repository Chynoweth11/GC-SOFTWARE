import { forbidden, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { checkAgainstDetermination, FREQUENCY_LABELS } from '@/lib/finance'
import { getProjectCompliance, getProjectLabor } from '@/lib/queries/labor'
import { getEquipmentItems, getProjectEquipment } from '@/lib/queries/equipment'
import { getJurisdictionOptions, getProjectWageSheets } from '@/lib/queries/wage-rates'
import { InfoNote, Kpi, KpiGrid, MoneyKpi, Section } from '@/components/ui'
import { LaborAssignments } from '@/components/project/labor-assignments'
import { EquipmentAssignments } from '@/components/project/equipment-assignments'
import { ComplianceList } from '@/components/project/compliance-list'
import { WageRateSheets } from '@/components/project/wage-rate-sheets'
import { hours, money, percent } from '@/lib/format'
import {
  deleteComplianceRequirement,
  deleteComplianceSubmission,
  deleteEquipmentAssignment,
  deleteLaborAssignment,
  recordComplianceSubmission,
  saveComplianceRequirement,
  saveEquipmentAssignment,
  saveLaborAssignment,
} from './actions'
import { deleteWageLine, deleteWageSheet, saveWageLine, saveWageSheet, verifyWageSheet } from './wage-actions'

export const metadata = { title: 'Labor and equipment' }

/**
 * Everything about people on this job, in one place.
 *
 * Three things that are usually kept apart and should not be. What the team and
 * the labor cost this job, because that is most of the money on it and it is
 * the part a bid gets wrong. What the schedule requires be paid, where the work
 * is prevailing wage. And what has to be filed and by when, because a certified
 * payroll three weeks late stops a payment application as surely as a budget
 * overrun does.
 *
 * Every figure is worked out on the way to this page from the wage or salary
 * entered once in the classification library. Nothing costed here is stored.
 */
export default async function ProjectLaborPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!can(user.role, 'view:wage_rates')) forbidden()

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  })
  if (!project) notFound()

  const [labor, equipment, equipmentItems, compliance, sheets, jurisdictions, classifications, costCodes, people] =
    await Promise.all([
    getProjectLabor(id, user.companyId),
    getProjectEquipment(id, user.companyId),
    getEquipmentItems(user.companyId),
    getProjectCompliance(id, user.companyId),
    getProjectWageSheets(id, user.companyId),
    getJurisdictionOptions(user.companyId),
    prisma.laborClassification.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, kind: true, payBasis: true, active: true },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.costCode.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, code: true, description: true },
      orderBy: { code: 'asc' },
    }),
    prisma.user.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  const canEdit = can(user.role, 'edit:wage_rates')

  // The loaded rate for each classification comes from the same engine the
  // assignment rows were costed with, so the picker cannot quote a rate the
  // table would disagree with.
  const loadedRateById = new Map(labor.rows.map((row) => [row.classificationId, row.loadedHourlyCost]))
  const classificationOptions = classifications.map((entry) => ({
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    payBasis: entry.payBasis,
    loadedHourlyCost: loadedRateById.get(entry.id) ?? 0,
    active: entry.active,
  }))

  const staffCost = labor.byKind.find((group) => group.kind === 'STAFF')?.cost ?? 0
  const fieldCost = labor.byKind.find((group) => group.kind === 'FIELD')?.cost ?? 0

  return (
    <div className="space-y-6">
      <KpiGrid cols={5}>
        <MoneyKpi
          label="People and plant on this job"
          amount={labor.totals.cost + equipment.totals.cost}
          detail={`${labor.rows.length + equipment.rows.length} entries`}
        />
        <MoneyKpi label="Field labor" amount={fieldCost} detail={`${hours(labor.byKind.find((g) => g.kind === 'FIELD')?.hours ?? 0)} hours`} />
        <MoneyKpi label="Project team" amount={staffCost} detail="Salaried people charged to this job" />
        <MoneyKpi
          label="Equipment"
          amount={equipment.totals.cost}
          tone={equipment.totals.standbyCost > 0 ? 'caution' : 'neutral'}
          detail={
            equipment.totals.standbyCost > 0
              ? `${money(equipment.totals.standbyCost)} of it standby`
              : `${hours(equipment.totals.operatingHours)} hours run`
          }
        />
        <Kpi
          label="Compliance"
          value={compliance.overdue > 0 ? `${compliance.overdue} overdue` : compliance.dueSoon > 0 ? `${compliance.dueSoon} due soon` : 'Up to date'}
          detail={
            compliance.onTimeRate === null
              ? 'Nothing recorded yet'
              : `${percent(compliance.onTimeRate)} of deadlines answered`
          }
          tone={compliance.overdue > 0 ? 'adverse' : compliance.dueSoon > 0 ? 'caution' : 'favorable'}
        />
      </KpiGrid>

      <Section
        title="Project team and labor"
        description="Who is charged to this job, and what they cost it"
      >
        <div className="mb-3">
          <InfoNote>
            Rates come from the classification library in Settings, fully loaded: the wage or salary, the fringe, then
            unemployment, social security and Medicare on the wage alone, then training and workers compensation as
            dollars an hour. A salaried person goes on as a share of their time across a range of dates, which is how
            a project team is actually staffed. Change a wage once and every job that person is on reprices.
          </InfoNote>
        </div>

        <LaborAssignments
          projectId={id}
          canEdit={canEdit}
          save={saveLaborAssignment}
          remove={deleteLaborAssignment}
          classifications={classificationOptions}
          costCodes={costCodes.map((code) => ({ id: code.id, label: `${code.code} ${code.description}` }))}
          totals={labor.totals}
          byKind={labor.byKind}
          issues={labor.issues}
          rows={labor.rows.map((row) => ({
            id: row.id,
            displayName: row.displayName,
            className: row.className,
            classificationId: row.classificationId,
            label: row.label,
            kind: row.kind,
            basis: row.basis,
            budgetedHours: row.budgetedHours,
            allocationPct: row.allocationPct,
            startDate: row.startDate ? row.startDate.toISOString() : null,
            endDate: row.endDate ? row.endDate.toISOString() : null,
            loadedRateOverride: row.loadedRateOverride,
            loadedHourlyCost: row.loadedHourlyCost,
            weeks: row.weeks,
            hours: row.hours,
            cost: row.cost,
            workingOut: row.workingOut,
            costCodeId: row.costCodeId,
            costCodeLabel: row.costCodeLabel,
            classificationActive: row.classificationActive,
            notes: null,
            issues: row.issues,
          }))}
        />

        {labor.byCostCategory.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Landing in{' '}
            {labor.byCostCategory
              .map((group) => `${group.category.toLowerCase().replace(/_/g, ' ')} ${money(group.cost)}`)
              .join(', ')}
            .
          </p>
        )}
      </Section>

      <Section
        title="Equipment on this job"
        description="What each machine is costing, split into the hire, the fuel and wear, and the time it stood idle"
      >
        <EquipmentAssignments
          projectId={id}
          canEdit={canEdit}
          save={saveEquipmentAssignment}
          remove={deleteEquipmentAssignment}
          costCodes={costCodes.map((code) => ({ id: code.id, label: `${code.code} ${code.description}` }))}
          totals={equipment.totals}
          byOwnership={equipment.byOwnership}
          standbyShare={equipment.standbyShare}
          issues={equipment.issues}
          equipment={equipmentItems.map((item) => ({
            id: item.id,
            name: item.name,
            ownership: item.ownership,
            quotedBases: item.quotedBases,
            loadedHourlyCost: item.loadedHourlyCost,
            active: item.active,
          }))}
          rows={equipment.rows.map((row) => ({
            id: row.id,
            equipmentItemId: row.equipmentItemId,
            displayName: row.displayName,
            itemName: row.itemName,
            label: row.label,
            category: row.category,
            ownership: row.ownership,
            basis: row.basis,
            units: row.units,
            operatingHours: row.operatingHours,
            standbyHours: row.standbyHours,
            startDate: row.startDate ? row.startDate.toISOString() : null,
            endDate: row.endDate ? row.endDate.toISOString() : null,
            rateOverride: row.rateOverride,
            rate: row.rate,
            rateSource: row.rateSource,
            rentalCost: row.rentalCost,
            operatingCost: row.operatingCost,
            standbyCost: row.standbyCost,
            cost: row.cost,
            equivalentHours: row.equivalentHours,
            workingOut: row.workingOut,
            costCodeId: row.costCodeId,
            costCodeLabel: row.costCodeLabel,
            itemActive: row.itemActive,
            notes: null,
            issues: row.issues,
          }))}
        />
      </Section>

      <Section
        title="Compliance and deadlines"
        description={compliance.headline}
      >
        <ComplianceList
          projectId={id}
          canEdit={canEdit}
          save={saveComplianceRequirement}
          remove={deleteComplianceRequirement}
          record={recordComplianceSubmission}
          withdraw={deleteComplianceSubmission}
          people={people.map((person) => ({ id: person.id, name: person.name }))}
          rows={compliance.rows.map((row) => ({
            id: row.requirement.id,
            kind: row.kind,
            title: row.requirement.title,
            agency: row.requirement.agency,
            frequency: row.requirement.frequency,
            frequencyLabel: FREQUENCY_LABELS[row.requirement.frequency] ?? row.requirement.frequency,
            firstDueDate: row.requirement.firstDueDate.toISOString(),
            endsOn: row.requirement.endsOn ? row.requirement.endsOn.toISOString() : null,
            leadDays: row.requirement.leadDays,
            responsibleUserId: null,
            responsibleName: row.requirement.responsibleName,
            notes: null,
            active: row.requirement.active,
            status: row.status,
            summary: row.summary,
            nextDueDate: row.nextDueDate ? row.nextDueDate.toISOString() : null,
            daysUntilDue: row.daysUntilDue,
            missedCount: row.missedDueDates.length,
            deadlinesToDate: row.deadlinesToDate,
            submissionCount: row.submissionCount,
            lastSubmittedAt: row.lastSubmittedAt ? row.lastSubmittedAt.toISOString() : null,
            submissions: row.submissions.map((submission) => ({
              id: submission.id,
              dueDate: submission.dueDate.toISOString(),
              periodEnd: submission.periodEnd ? submission.periodEnd.toISOString() : null,
              submittedAt: submission.submittedAt.toISOString(),
              submittedByName: submission.submittedByName,
              reference: submission.reference,
            })),
          }))}
        />
      </Section>

      <Section
        title="Prevailing wage"
        description="The fully loaded hourly cost of each classification the schedule names, for work that carries a wage determination"
      >
        <div className="mb-3">
          <InfoNote>
            Unemployment, social security and Medicare are charged on the wage only. A bona fide fringe benefit is not
            wages, so it does not attract them, and training and workers compensation go in as dollars per hour worked.
            Overtime pays the premium on the wage alone. Nothing is rounded until it reaches the screen.
          </InfoNote>
        </div>

        <WageRateSheets
          projectId={id}
          canEdit={canEdit}
          saveSheet={saveWageSheet}
          deleteSheet={deleteWageSheet}
          saveLine={saveWageLine}
          deleteLine={deleteWageLine}
          verifySheet={verifyWageSheet}
          jurisdictions={jurisdictions.map((jurisdiction) => ({
            id: jurisdiction.id,
            code: jurisdiction.code,
            name: jurisdiction.name,
            hasRate: jurisdiction.sutaPct !== null,
            counties: jurisdiction.counties.map((county) => ({ id: county.id, name: county.name })),
          }))}
          sheets={sheets.map((sheet) => ({
            id: sheet.id,
            name: sheet.name,
            rateScheduleDate: sheet.rateScheduleDate ? sheet.rateScheduleDate.toISOString() : null,
            determinationRef: sheet.determinationRef,
            notes: sheet.notes,
            jurisdictionId: sheet.jurisdiction.id,
            jurisdictionLabel: sheet.jurisdiction.name,
            jurisdictionNotes: sheet.jurisdiction.notes,
            wageAuthority: sheet.jurisdiction.wageAuthority,
            workersCompBasis: sheet.jurisdiction.workersCompBasis,
            countyId: sheet.county?.id ?? null,
            countyLabel: sheet.county?.name ?? null,
            rates: sheet.rates,
            sutaPctOverride: sheet.rates.sutaSource === 'sheet override' ? sheet.rates.sutaPct : null,
            verifiedAt: sheet.verifiedAt ? sheet.verifiedAt.toISOString() : null,
            verifiedByName: sheet.verifiedByName,
            verifiedNote: sheet.verifiedNote,
            jurisdictionVerifiedAt: sheet.jurisdiction.verifiedAt ? sheet.jurisdiction.verifiedAt.toISOString() : null,
            jurisdictionVerifiedNote: sheet.jurisdiction.verifiedNote,
            issues: sheet.summary.issues,
            totals: sheet.summary.totals,
            averages: sheet.summary.averages,
            lines: sheet.lines.map((line, index) => {
              const derived = sheet.summary.rows[index]
              const published =
                line.publishedBaseWage !== null && line.publishedFringe !== null
                  ? checkAgainstDetermination(derived, {
                      baseWage: line.publishedBaseWage,
                      fringe: line.publishedFringe,
                    })
                  : null

              return {
                id: line.id,
                trade: line.trade,
                classification: line.classification,
                hourlyWage: line.hourlyWage,
                hourlyBenefits: line.hourlyBenefits,
                trainingPerHour: line.trainingPerHour,
                workersCompPerHour: line.workersCompPerHour,
                overtimeMultiplier: line.overtimeMultiplier,
                publishedBaseWage: line.publishedBaseWage,
                publishedFringe: line.publishedFringe,
                notes: line.notes,
                derived: {
                  subtotal: derived.subtotal,
                  futa: derived.futa,
                  fica: derived.fica,
                  suta: derived.suta,
                  training: derived.training,
                  workersComp: derived.workersComp,
                  totalBurden: derived.totalBurden,
                  total: derived.total,
                  burdenPctOfWage: derived.burdenPctOfWage,
                  overtimeTotal: derived.overtime.total,
                  overtimeMultiplier: derived.overtimeMultiplier,
                  compliance: published,
                },
              }
            }),
          }))}
        />
      </Section>
    </div>
  )
}
