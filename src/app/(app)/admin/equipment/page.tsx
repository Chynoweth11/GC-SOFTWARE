import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getEquipmentItems, getFleet } from '@/lib/queries/equipment'
import { OWNERSHIP_LABELS } from '@/lib/finance'
import { hours, percent } from '@/lib/format'
import { InfoNote, Kpi, KpiGrid, MoneyKpi, Section } from '@/components/ui'
import { EquipmentLibrary } from '@/components/admin/equipment-library'
import { FleetTable } from '@/components/admin/fleet-table'
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

  const [items, fleet, vendors] = await Promise.all([
    getEquipmentItems(user.companyId),
    getFleet(user.companyId),
    prisma.vendor.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <Section
        title="What the fleet is doing"
        description="Every machine across every live job. The idle ones are not hidden, because they are the point"
      >
        <KpiGrid cols={5}>
          <MoneyKpi
            label="Plant cost across live jobs"
            amount={fleet.totals.cost}
            detail={`${fleet.rows.filter((row) => row.jobCount > 0).length} machines earning`}
          />
          <MoneyKpi
            label="Paid to stand"
            amount={fleet.totals.standbyCost}
            tone={fleet.standbyShare > 0.25 ? 'adverse' : fleet.totals.standbyCost > 0 ? 'caution' : 'favorable'}
            detail={
              fleet.totals.cost > 0 ? `${percent(fleet.standbyShare)} of the plant cost` : 'Nothing standing'
            }
          />
          <Kpi
            label="Hours run against hours hired"
            value={fleet.totals.hiredHours > 0 ? percent(fleet.utilization) : '-'}
            tone={fleet.totals.hiredHours > 0 && fleet.utilization < 0.5 ? 'caution' : 'neutral'}
            detail={`${hours(fleet.totals.operatingHours)} of ${hours(fleet.totals.hiredHours)} hours`}
          />
          <Kpi
            label="On no job"
            value={fleet.idleCount.toString()}
            tone={fleet.idleCount > 0 ? 'caution' : 'favorable'}
            detail={fleet.idleCount > 0 ? 'Costing whatever they cost to own' : 'Every machine is out'}
          />
          <Kpi
            label="Standing more than a quarter"
            value={fleet.standbyHeavy.length.toString()}
            tone={fleet.standbyHeavy.length > 0 ? 'caution' : 'favorable'}
            detail={
              fleet.standbyHeavy.length > 0
                ? fleet.standbyHeavy
                    .slice(0, 2)
                    .map((row) => row.name)
                    .join(', ')
                : 'None'
            }
          />
        </KpiGrid>

        <div className="mt-3">
          <FleetTable
            rows={fleet.rows.map((row) => ({
              itemId: row.itemId,
              name: row.name,
              category: row.category,
              ownershipLabel: OWNERSHIP_LABELS[row.ownership] ?? row.ownership,
              vendorName: row.vendorName,
              active: row.active,
              loadedHourlyCost: row.loadedHourlyCost,
              jobCount: row.jobCount,
              rentalCost: row.rentalCost,
              operatingCost: row.operatingCost,
              standbyCost: row.standbyCost,
              cost: row.cost,
              operatingHours: row.operatingHours,
              standbyHours: row.standbyHours,
              hiredHours: row.hiredHours,
              standbyShare: row.standbyShare,
              utilization: row.utilization,
              issues: row.issues,
              jobs: fleet.jobsByItem.get(row.itemId) ?? [],
            }))}
          />
        </div>
      </Section>

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
