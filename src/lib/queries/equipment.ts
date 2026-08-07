import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import {
  deriveEquipmentItem,
  deriveEquipmentUse,
  summarizeProjectEquipment,
  type EquipmentItemDerived,
  type EquipmentUseDerived,
  type ProjectEquipmentSummary,
} from '@/lib/finance'

/**
 * The equipment list, and what each machine is costing which job.
 *
 * Every rate reaches every page through here, so a rate changed on the list
 * reprices the estimate line that names the machine, the change order line that
 * runs it, the time and materials ticket it was on, and the project budget it
 * lands in. None of them holds a copy.
 */

export interface EquipmentItemView extends EquipmentItemDerived {
  code: string | null
  vendorId: string | null
  vendorName: string | null
  assetTag: string | null
  notes: string | null
  active: boolean
  /** How many jobs are carrying this machine right now. */
  assignmentCount: number
}

export const getEquipmentItems = cache(async (companyId: string): Promise<EquipmentItemView[]> => {
  const records = await prisma.equipmentItem.findMany({
    where: { companyId },
    include: {
      vendor: { select: { name: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })

  return records.map((record) => ({
    ...deriveEquipmentItem({
      id: record.id,
      name: record.name,
      category: record.category,
      ownership: record.ownership,
      hourlyRate: record.hourlyRate,
      dailyRate: record.dailyRate,
      weeklyRate: record.weeklyRate,
      monthlyRate: record.monthlyRate,
      operatingCostPerHour: record.operatingCostPerHour,
      standbyRatePerHour: record.standbyRatePerHour,
      hoursPerDay: record.hoursPerDay,
      daysPerWeek: record.daysPerWeek,
      costCategory: record.costCategory,
    }),
    code: record.code,
    vendorId: record.vendorId,
    vendorName: record.vendor?.name ?? null,
    assetTag: record.assetTag,
    notes: record.notes,
    active: record.active,
    assignmentCount: record._count.assignments,
  }))
})

/**
 * The rate table a priced line uses when it names a machine.
 *
 * The hourly figure including fuel and wear, because a line that says "two
 * hours of the mini excavator" means two hours of it running, and a rate that
 * left the fuel out would understate every one of them.
 */
export const equipmentRateTable = cache(async (companyId: string): Promise<Map<string, number>> => {
  const items = await getEquipmentItems(companyId)
  return new Map(items.map((item) => [item.name, item.loadedHourlyCost]))
})

export interface ProjectEquipmentView extends ProjectEquipmentSummary {
  rows: (EquipmentUseDerived & { costCodeLabel: string | null; itemActive: boolean })[]
}

export const getProjectEquipment = cache(
  async (projectId: string, companyId: string): Promise<ProjectEquipmentView> => {
    const [items, assignments] = await Promise.all([
      getEquipmentItems(companyId),
      prisma.projectEquipmentAssignment.findMany({
        where: { projectId, project: { companyId } },
        include: {
          costCode: { select: { code: true, description: true } },
          item: { select: { active: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    const byId = new Map(items.map((item) => [item.id, item]))

    const rows = assignments.flatMap((assignment) => {
      const item = byId.get(assignment.equipmentItemId)
      if (!item) return []

      const derived = deriveEquipmentUse(
        {
          id: assignment.id,
          equipmentItemId: assignment.equipmentItemId,
          label: assignment.label,
          costCodeId: assignment.costCodeId,
          basis: assignment.basis,
          units: assignment.units,
          operatingHours: assignment.operatingHours,
          standbyHours: assignment.standbyHours,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          rateOverride: assignment.rateOverride,
        },
        item,
      )

      return [
        {
          ...derived,
          costCodeLabel: assignment.costCode
            ? `${assignment.costCode.code} ${assignment.costCode.description}`
            : null,
          itemActive: assignment.item.active,
        },
      ]
    })

    return { ...summarizeProjectEquipment(rows), rows }
  },
)
