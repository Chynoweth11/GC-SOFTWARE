import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getJurisdictions } from '@/lib/queries/wage-rates'
import { InfoNote, Section } from '@/components/ui'
import { FederalRatesForm, JurisdictionManager } from '@/components/admin/jurisdiction-manager'
import { RateImport } from '@/components/admin/rate-import'
import { COUNTIES_SEEDED } from '@/lib/reference/jurisdictions'
import {
  deleteCounty,
  importCounties,
  importJurisdictionRates,
  saveCounty,
  saveFederalRates,
  saveJurisdiction,
  verifyJurisdiction,
} from './actions'

export const metadata = { title: 'Payroll and prevailing wage' }

/**
 * The reference data every wage sheet reads through.
 *
 * Two federal rates at the top, because they are the same in every state, then
 * the states. Nothing here is copied onto a sheet: correcting a rate here
 * corrects every sheet built on it, which is the only behaviour that can be right.
 */
export default async function PayrollSettingsPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  const [company, jurisdictions] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { futaPct: true, ficaPct: true },
    }),
    getJurisdictions(user.companyId),
  ])

  const canEditFederal = can(user.role, 'edit:company_settings')
  const seededNames = jurisdictions
    .filter((jurisdiction) => COUNTIES_SEEDED.includes(jurisdiction.code))
    .map((jurisdiction) => jurisdiction.name)

  return (
    <div className="space-y-6">
      <Section
        title="Federal payroll rates"
        description="The two rates that do not vary by state, held once so no sheet can carry a stale copy"
      >
        <FederalRatesForm
          futaPct={company.futaPct}
          ficaPct={company.ficaPct}
          canEdit={canEditFederal}
          save={saveFederalRates}
        />
      </Section>

      <Section
        title="States and counties"
        description="Every state and the District of Columbia, ready for a wage sheet the day work reaches them"
      >
        <div className="mb-3">
          <InfoNote>
            No unemployment rate is supplied with the software. That rate is assigned to each employer every year, so a
            figure shipped here would be wrong for most companies on the day it shipped. Enter yours from the annual
            notice and record who checked it. Counties come complete for {seededNames.join(' and ') || 'no state yet'};
            everywhere else they are added here as jobs reach them, because prevailing wage is determined county by
            county.
          </InfoNote>
        </div>

        <div className="mb-3">
          <RateImport
            save={importJurisdictionRates}
            entered={jurisdictions.filter((jurisdiction) => jurisdiction.sutaPct !== null).length}
            total={jurisdictions.length}
          />
        </div>

        <JurisdictionManager
          canEdit={can(user.role, 'manage:reference_data')}
          save={saveJurisdiction}
          verify={verifyJurisdiction}
          saveCounty={saveCounty}
          deleteCounty={deleteCounty}
          importCounties={importCounties}
          jurisdictions={jurisdictions.map((jurisdiction) => ({
            id: jurisdiction.id,
            code: jurisdiction.code,
            name: jurisdiction.name,
            sutaPct: jurisdiction.sutaPct,
            sutaWageBase: jurisdiction.sutaWageBase,
            sutaRateYear: jurisdiction.sutaRateYear,
            workersCompBasis: jurisdiction.workersCompBasis,
            stateFund: jurisdiction.stateFund,
            wageAuthority: jurisdiction.wageAuthority,
            notes: jurisdiction.notes,
            verifiedAt: jurisdiction.verifiedAt ? jurisdiction.verifiedAt.toISOString() : null,
            verifiedByName: jurisdiction.verifiedByName,
            verifiedNote: jurisdiction.verifiedNote,
            active: jurisdiction.active,
            countyCount: jurisdiction.countyCount,
            sheetCount: jurisdiction.sheetCount,
            counties: jurisdiction.counties.map((county) => ({
              id: county.id,
              name: county.name,
              notes: county.notes,
              verifiedAt: county.verifiedAt ? county.verifiedAt.toISOString() : null,
            })),
          }))}
        />
      </Section>
    </div>
  )
}
