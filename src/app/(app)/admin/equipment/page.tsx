import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getEquipmentItems } from '@/lib/queries/equipment'
import { InfoNote, Section } from '@/components/ui'
import { EquipmentLibrary } from '@/components/admin/equipment-library'
import { deleteEquipmentItem, saveEquipmentItem } from './actions'

export const metadata = { title: 'Equipment and rates' }

/**
 * What the company's plant costs, entered once.
 *
 * Read live by everything that prices equipment: a takeoff line that runs a
 * machine by the hour, a change order line, a time and materials ticket, and
 * the machines charged to a job. A rate changed here moves all of them.
 */
export default async function EquipmentSettingsPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  const [items, vendors] = await Promise.all([
    getEquipmentItems(user.companyId),
    prisma.vendor.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <Section
        title="Equipment and rates"
        description="Every machine the company owns or hires, and what an hour, a day, a week and a month of it costs"
      >
        <div className="mb-3">
          <InfoNote>
            Three things about plant are true on a job and are kept true here. A weekly rate is almost never five daily
            rates, so each basis is entered as it is quoted rather than derived from another. Fuel and wear are charged
            by the hour the machine actually runs, kept apart from the hire, so a week of rain does not bill fuel
            nobody burned. And a working day is recorded rather than assumed, because a haul truck on two shifts is not
            eight hours.
          </InfoNote>
        </div>

        <EquipmentLibrary
          canEdit={can(user.role, 'manage:reference_data')}
          save={saveEquipmentItem}
          remove={deleteEquipmentItem}
          vendors={vendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))}
          rows={items.map((item) => ({
            id: item.id,
            code: item.code,
            name: item.name,
            category: item.category,
            ownership: item.ownership,
            hourlyRate: item.hourlyRate,
            dailyRate: item.dailyRate,
            weeklyRate: item.weeklyRate,
            monthlyRate: item.monthlyRate,
            operatingCostPerHour: item.operatingCostPerHour,
            standbyRatePerHour: item.standbyRatePerHour,
            hoursPerDay: item.hoursPerDay,
            daysPerWeek: item.daysPerWeek,
            vendorId: item.vendorId,
            vendorName: item.vendorName,
            assetTag: item.assetTag,
            costCategory: item.costCategory,
            notes: item.notes,
            active: item.active,
            assignmentCount: item.assignmentCount,
            effectiveHourlyRate: item.effectiveHourlyRate,
            hourlyRateSource: item.hourlyRateSource,
            loadedHourlyCost: item.loadedHourlyCost,
            quotedBases: item.quotedBases,
            issues: item.issues,
          }))}
        />
      </Section>
    </div>
  )
}
