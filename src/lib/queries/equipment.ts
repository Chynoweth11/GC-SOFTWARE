import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import {
  deriveEquipmentItem,
  deriveEquipmentUse,
  summarizeFleet,
  summarizeProjectEquipment,
  type EquipmentItemDerived,
  type EquipmentUseDerived,
  type FleetSummary,
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

export interface FleetView extends FleetSummary {
  /** Which jobs each machine is on, for the rows worth chasing. */
  jobsByItem: Map<string, { projectId: string; projectNumber: string; projectName: string; cost: number }[]>
}

/**
 * The whole fleet, across every live job.
 *
 * Reads the same assignments the project tab reads and prices them through the
 * same engine, so the company view and the job view cannot disagree about what
 * a machine cost. Closed and completed jobs are left out: the question this
 * page answers is what the fleet is doing now, and a machine that finished a
 * job last year is idle today whatever it did then.
 */
export const getFleet = cache(async (companyId: string): Promise<FleetView> => {
  const [items, assignments] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: { companyId },
      include: { vendor: { select: { name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.projectEquipmentAssignment.findMany({
      where: {
        project: { companyId, status: { notIn: ['CLOSED', 'COMPLETED'] } },
      },
      include: { project: { select: { id: true, number: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  const itemsById = new Map(items.map((item) => [item.id, item]))

  const uses = assignments
    .filter((assignment) => itemsById.has(assignment.equipmentItemId))
    .map((assignment) => {
      const item = itemsById.get(assignment.equipmentItemId)!
      return {
        ...deriveEquipmentUse(
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
          deriveEquipmentItem(item),
        ),
        projectId: assignment.projectId,
        projectNumber: assignment.project.number,
        projectName: assignment.project.name,
      }
    })

  const summary = summarizeFleet(
    items.map((item) => ({
      id: item.id,
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
      costCategory: item.costCategory,
      vendorName: item.vendor?.name ?? null,
      active: item.active,
    })),
    uses,
  )

  const jobsByItem = new Map<
    string,
    { projectId: string; projectNumber: string; projectName: string; cost: number }[]
  >()
  for (const entry of uses) {
    const list = jobsByItem.get(entry.equipmentItemId) ?? []
    const already = list.find((job) => job.projectId === entry.projectId)
    if (already) already.cost += entry.cost
    else {
      list.push({
        projectId: entry.projectId,
        projectNumber: entry.projectNumber,
        projectName: entry.projectName,
        cost: entry.cost,
      })
    }
    jobsByItem.set(entry.equipmentItemId, list)
  }

  return { ...summary, jobsByItem }
})
