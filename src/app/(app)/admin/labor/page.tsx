import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getLaborClassifications, getOverheadSummary } from '@/lib/queries/labor'
import { InfoNote, Section } from '@/components/ui'
import { LaborLibrary, OverheadLibrary } from '@/components/admin/labor-library'
import {
  adoptDerivedOverheadRate,
  deleteLaborClassification,
  deleteOverheadCost,
  saveLaborClassification,
  saveOverheadCost,
} from './actions'

export const metadata = { title: 'Labor rates and overhead' }

/**
 * What people cost, and what the rest of the company costs.
 *
 * The two halves of a bid that are not a takeoff. Above, the classification
 * library: one place where a wage or a salary is entered, read live by
 * estimates, by project team assignments and by the overhead figure below.
 * Below, the overhead the company carries and the recovery rate it works out
 * to, next to the rate bids are actually charging.
 */
export default async function LaborSettingsPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  const [classifications, overhead, jurisdictions, trades] = await Promise.all([
    getLaborClassifications(user.companyId),
    getOverheadSummary(user.companyId),
    prisma.payrollJurisdiction.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true, code: true, sutaPct: true },
      orderBy: { name: 'asc' },
    }),
    prisma.trade.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  const canEdit = can(user.role, 'manage:reference_data')

  return (
    <div className="space-y-6">
      <Section
        title="What people cost"
        description="One place a wage or a salary is entered, read live by estimates, project budgets and the overhead rate"
      >
        <div className="mb-3">
          <InfoNote>
            Every rate below is built the way a certified payroll form builds one: the wage or salary, the fringe, then
            unemployment, social security and Medicare on the wage alone, then training and workers compensation as
            dollars an hour. A rate an estimate takes from here already carries that burden, so the estimate does not
            add its flat burden percentage on top of it. A salary is reduced to an hour by the hours a year it is
            actually spread over.
          </InfoNote>
        </div>

        <LaborLibrary
          canEdit={canEdit}
          save={saveLaborClassification}
          remove={deleteLaborClassification}
          jurisdictions={jurisdictions.map((jurisdiction) => ({
            id: jurisdiction.id,
            label: `${jurisdiction.name}${jurisdiction.sutaPct === null ? ' (no unemployment rate yet)' : ''}`,
          }))}
          trades={trades.map((trade) => ({ id: trade.id, label: trade.name }))}
          rows={classifications.map((entry) => ({
            id: entry.id,
            code: entry.code,
            name: entry.name,
            kind: entry.kind,
            payBasis: entry.payBasis,
            baseAmount: entry.baseAmount,
            benefitsAmount: entry.benefitsAmount,
            annualHours: entry.annualHours,
            trainingPerHour: entry.trainingPerHour,
            workersCompRate: entry.workersCompRate,
            workersCompBasis: entry.workersCompBasis,
            jurisdictionId: entry.jurisdictionId,
            sutaSource: entry.sutaSource,
            costCategory: entry.costCategory,
            tradeId: null,
            notes: entry.notes,
            active: entry.active,
            assignmentCount: entry.assignmentCount,
            assignedShare: entry.assignedShare,
            hourlyWage: entry.hourlyWage,
            hourlyBenefits: entry.hourlyBenefits,
            hourlyBurden: entry.hourlyBurden,
            loadedHourlyCost: entry.loadedHourlyCost,
            loadedWeeklyCost: entry.loadedWeeklyCost,
            loadedAnnualCost: entry.loadedAnnualCost,
            burdenPctOfWage: entry.burdenPctOfWage,
            issues: entry.issues,
          }))}
        />
      </Section>

      <Section
        title="Overhead and the rate bids carry"
        description="What being in business costs a year, and the recovery rate that works out to"
      >
        <OverheadLibrary
          canEdit={canEdit}
          canAdopt={can(user.role, 'edit:company_settings')}
          save={saveOverheadCost}
          remove={deleteOverheadCost}
          adopt={adoptDerivedOverheadRate}
          rows={overhead.rows.map((row) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            amount: row.amount,
            period: row.period,
            annualAmount: row.annualAmount,
            monthlyAmount: row.monthlyAmount,
            notes: null,
          }))}
          summary={{
            annualNonPayroll: overhead.annualNonPayroll,
            annualUnassignedStaff: overhead.annualUnassignedStaff,
            annualOverhead: overhead.annualOverhead,
            monthlyOverhead: overhead.monthlyOverhead,
            annualRevenue: overhead.annualRevenue,
            revenueBasis: overhead.revenueBasis,
            derivedRate: overhead.derivedRate,
            rateOnFile: overhead.rateOnFile,
            rateGap: overhead.rateGap,
            annualGap: overhead.annualGap,
            byCategory: overhead.byCategory,
            issues: overhead.issues,
            staff: overhead.staff,
          }}
        />
      </Section>
    </div>
  )
}
