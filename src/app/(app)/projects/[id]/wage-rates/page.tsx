import { forbidden, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { checkAgainstDetermination } from '@/lib/finance'
import { getJurisdictionOptions, getProjectWageSheets } from '@/lib/queries/wage-rates'
import { InfoNote, Section } from '@/components/ui'
import { WageRateSheets } from '@/components/project/wage-rate-sheets'
import { deleteWageLine, deleteWageSheet, saveWageLine, saveWageSheet, verifyWageSheet } from './actions'

export const metadata = { title: 'Wage rates' }

/**
 * Prevailing wage rates for the project.
 *
 * Every figure the page shows is computed here from the entered boxes by the
 * payroll engine, the same engine the exports use, so there is one answer to
 * what a trade costs an hour on this job and it is the same one everywhere.
 */
export default async function WageRatesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  if (!can(user.role, 'view:wage_rates')) forbidden()

  const { id } = await params
  const project = await prisma.project.findFirst({
    where: { id, companyId: user.companyId },
    select: { id: true },
  })
  if (!project) notFound()

  const [sheets, jurisdictions] = await Promise.all([
    getProjectWageSheets(id, user.companyId),
    getJurisdictionOptions(user.companyId),
  ])

  const canEdit = can(user.role, 'edit:wage_rates')

  return (
    <div className="space-y-5">
      <Section
        title="Prevailing wage"
        description="The fully loaded hourly cost of each classification, built up from the wage and fringe the schedule requires"
      >
        <InfoNote>
          Unemployment, social security and Medicare are charged on the wage only. A bona fide fringe benefit is not
          wages, so it does not attract them, and training and workers compensation go in as dollars per hour worked.
          Overtime pays the premium on the wage alone. Nothing is rounded until it reaches the screen.
        </InfoNote>
      </Section>

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
          sutaPctOverride:
            sheet.rates.sutaSource === 'sheet override' ? sheet.rates.sutaPct : null,
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
    </div>
  )
}
