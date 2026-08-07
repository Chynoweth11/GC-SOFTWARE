import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import {
  deriveAssignment,
  deriveCompliance,
  deriveLaborClass,
  summarizeCompliance,
  summarizeOverhead,
  summarizeProjectLabor,
  today,
  unassignedStaffCost,
  type AssignmentDerived,
  type ComplianceDerived,
  type ComplianceSummary,
  type LaborClassDerived,
  type OverheadSummary,
  type PayrollBurdenRates,
  type ProjectLaborSummary,
  type StaffUtilization,
} from '@/lib/finance'

/**
 * Reads the labor library, who is on which job, and what is owed to whom.
 *
 * Every rate on every page below comes through `deriveLaborClass`, and every
 * rate that engine builds comes through the same burden stack as the certified
 * payroll form. A wage entered once therefore prices a takeoff line, a project
 * team assignment, a general conditions budget and an overhead recovery rate,
 * and none of those can quietly disagree with the others.
 */

/** Federal rates live on the company; they do not vary by state. */
async function federalRates(companyId: string) {
  return prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { futaPct: true, ficaPct: true, defaultOverheadPct: true },
  })
}

export interface LaborClassView extends LaborClassDerived {
  code: string | null
  tradeName: string | null
  jurisdictionId: string | null
  jurisdictionLabel: string | null
  /** Where the state unemployment rate came from, or that it is missing. */
  sutaSource: string
  workersCompRate: number
  workersCompBasis: 'PER_HOUR' | 'PER_100_PAYROLL'
  baseAmount: number
  benefitsAmount: number
  annualHours: number
  trainingPerHour: number
  notes: string | null
  active: boolean
  assignmentCount: number
  /** The share of this person the live jobs are carrying today. */
  assignedShare: number
}

export const getLaborClassifications = cache(async (companyId: string): Promise<LaborClassView[]> => {
  const asOf = today()

  const [company, records] = await Promise.all([
    federalRates(companyId),
    prisma.laborClassification.findMany({
      where: { companyId },
      include: {
        jurisdiction: { select: { id: true, name: true, code: true, sutaPct: true, workersCompBasis: true } },
        trade: { select: { name: true } },
        assignments: {
          select: { id: true, basis: true, allocationPct: true, startDate: true, endDate: true },
        },
      },
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  return records.map((record) => {
    const rates: PayrollBurdenRates = {
      futaPct: company.futaPct,
      ficaPct: company.ficaPct,
      sutaPct: record.jurisdiction?.sutaPct ?? 0,
    }

    const derived = deriveLaborClass(
      {
        id: record.id,
        name: record.name,
        kind: record.kind,
        payBasis: record.payBasis,
        baseAmount: record.baseAmount,
        benefitsAmount: record.benefitsAmount,
        annualHours: record.annualHours,
        trainingPerHour: record.trainingPerHour,
        workersCompRate: record.workersCompRate,
        // The basis is a property of the state, so it is read through the
        // jurisdiction rather than copied onto every classification.
        workersCompBasis: record.jurisdiction?.workersCompBasis ?? 'PER_100_PAYROLL',
        costCategory: record.costCategory,
      },
      rates,
    )

    // What share of this person the live allocations are carrying right now.
    const assignedShare = record.assignments
      .filter((assignment) => assignment.basis === 'ALLOCATION')
      .filter(
        (assignment) =>
          assignment.startDate !== null &&
          assignment.endDate !== null &&
          assignment.startDate.getTime() <= asOf.getTime() &&
          assignment.endDate.getTime() >= asOf.getTime(),
      )
      .reduce((total, assignment) => total + assignment.allocationPct, 0)

    return {
      ...derived,
      code: record.code,
      tradeName: record.trade?.name ?? null,
      jurisdictionId: record.jurisdictionId,
      jurisdictionLabel: record.jurisdiction ? `${record.jurisdiction.name}` : null,
      sutaSource: record.jurisdiction
        ? record.jurisdiction.sutaPct === null
          ? `${record.jurisdiction.name} has no rate entered`
          : record.jurisdiction.name
        : 'No state chosen',
      workersCompRate: record.workersCompRate,
      workersCompBasis: record.jurisdiction?.workersCompBasis ?? 'PER_100_PAYROLL',
      baseAmount: record.baseAmount,
      benefitsAmount: record.benefitsAmount,
      annualHours: record.annualHours,
      trainingPerHour: record.trainingPerHour,
      notes: record.notes,
      active: record.active,
      assignmentCount: record.assignments.length,
      assignedShare,
    }
  })
})

export interface ProjectLaborView extends ProjectLaborSummary {
  rows: (AssignmentDerived & { costCodeLabel: string | null; classificationActive: boolean })[]
}

export const getProjectLabor = cache(
  async (projectId: string, companyId: string): Promise<ProjectLaborView> => {
    const [classes, assignments] = await Promise.all([
      getLaborClassifications(companyId),
      prisma.projectLaborAssignment.findMany({
        where: { projectId, project: { companyId } },
        include: {
          costCode: { select: { code: true, description: true } },
          classification: { select: { active: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    const byId = new Map(classes.map((entry) => [entry.id, entry]))

    const rows = assignments.flatMap((assignment) => {
      const classification = byId.get(assignment.classificationId)
      if (!classification) return []

      const derived = deriveAssignment(
        {
          id: assignment.id,
          classificationId: assignment.classificationId,
          label: assignment.label,
          costCodeId: assignment.costCodeId,
          basis: assignment.basis,
          budgetedHours: assignment.budgetedHours,
          allocationPct: assignment.allocationPct,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          loadedRateOverride: assignment.loadedRateOverride,
        },
        classification,
      )

      return [
        {
          ...derived,
          costCodeLabel: assignment.costCode
            ? `${assignment.costCode.code} ${assignment.costCode.description}`
            : null,
          classificationActive: assignment.classification.active,
        },
      ]
    })

    return { ...summarizeProjectLabor(rows), rows }
  },
)

export interface ProjectComplianceView extends ComplianceSummary {
  rows: (ComplianceDerived & {
    kind: string
    submissions: {
      id: string
      dueDate: Date
      periodEnd: Date | null
      submittedAt: Date
      submittedByName: string | null
      reference: string | null
    }[]
  })[]
}

export const getProjectCompliance = cache(
  async (projectId: string, companyId: string): Promise<ProjectComplianceView> => {
    const records = await prisma.complianceRequirement.findMany({
      where: { projectId, project: { companyId } },
      include: {
        responsible: { select: { name: true } },
        submissions: {
          include: { submittedBy: { select: { name: true } } },
          orderBy: { dueDate: 'desc' },
        },
      },
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { firstDueDate: 'asc' }],
    })

    const asOf = today()

    const rows = records.map((record) => {
      const submissions = record.submissions.map((submission) => ({
        id: submission.id,
        dueDate: submission.dueDate,
        periodEnd: submission.periodEnd,
        submittedAt: submission.submittedAt,
        submittedByName: submission.submittedBy?.name ?? null,
        reference: submission.reference,
      }))

      const derived = deriveCompliance(
        {
          id: record.id,
          kind: record.kind,
          title: record.title,
          agency: record.agency,
          frequency: record.frequency,
          firstDueDate: record.firstDueDate,
          endsOn: record.endsOn,
          leadDays: record.leadDays,
          responsibleName: record.responsible?.name ?? null,
          active: record.active,
        },
        submissions,
        asOf,
      )

      return { ...derived, kind: record.kind, submissions }
    })

    return { ...summarizeCompliance(rows), rows }
  },
)

export interface OverheadView extends OverheadSummary {
  staff: StaffUtilization
  /** How the revenue figure was arrived at, so it can be checked. */
  revenueBasis: string
}

/**
 * The company overhead position, and what it says the bid rate should be.
 *
 * Revenue is the last twelve months of billings actually recorded, not a
 * forecast and not an annualized quarter, because a recovery rate built on a
 * hoped-for year recovers nothing.
 */
export const getOverheadSummary = cache(async (companyId: string): Promise<OverheadView> => {
  const asOf = today()
  const twelveMonthsAgo = new Date(Date.UTC(asOf.getUTCFullYear() - 1, asOf.getUTCMonth(), 1))

  const [company, costs, months, classes] = await Promise.all([
    federalRates(companyId),
    prisma.overheadCost.findMany({
      where: { companyId, active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.companyMonthly.findMany({
      where: { companyId, month: { gte: twelveMonthsAgo } },
      select: { month: true, billings: true },
      orderBy: { month: 'asc' },
    }),
    getLaborClassifications(companyId),
  ])

  /*
    Revenue over the months actually recorded, scaled to a year.

    Summing whatever months exist and calling it a year would overstate the
    recovery rate badly on a company three months into its records: three
    million of billings against six hundred thousand of overhead is not a
    twenty percent overhead rate, it is a partial year read as a whole one.
  */
  const recorded = months.filter((month) => month.billings > 0)
  const annualRevenue =
    recorded.length === 0
      ? 0
      : (recorded.reduce((total, month) => total + month.billings, 0) / recorded.length) * 12
  const staff = unassignedStaffCost(classes, new Map(classes.map((entry) => [entry.id, entry.assignedShare])))

  const summary = summarizeOverhead(
    costs.map((cost) => ({
      id: cost.id,
      name: cost.name,
      category: cost.category,
      amount: cost.amount,
      period: cost.period,
    })),
    {
      annualUnassignedStaff: staff.annualUnassigned,
      annualRevenue,
      rateOnFile: company.defaultOverheadPct,
    },
  )

  return {
    ...summary,
    staff,
    revenueBasis:
      recorded.length === 0
        ? 'No monthly billings recorded, so no recovery rate can be worked out'
        : recorded.length >= 12
          ? `Twelve months of recorded billings to ${recorded[recorded.length - 1].month.toISOString().slice(0, 7)}`
          : `${recorded.length} ${recorded.length === 1 ? 'month' : 'months'} of recorded billings to ${recorded[recorded.length - 1].month.toISOString().slice(0, 7)}, scaled to a year`,
  }
})

/** Everything owed across the portfolio, for the company dashboard. */
export const getCompanyCompliance = cache(async (companyId: string) => {
  // Every job still running, not only the ones whose status is literally
  // "active". A job under construction or in closeout still owes its filings,
  // and those are exactly the ones nobody has opened this week.
  const projects = await prisma.project.findMany({
    where: {
      companyId,
      status: { notIn: ['CLOSED', 'COMPLETED'] },
      complianceRequirements: { some: { active: true } },
    },
    select: { id: true, number: true, name: true },
    orderBy: { number: 'asc' },
  })

  const rows: {
    projectId: string
    projectNumber: string
    projectName: string
    row: ComplianceDerived
  }[] = []

  for (const project of projects) {
    const compliance = await getProjectCompliance(project.id, companyId)
    for (const row of compliance.rows) {
      if (!row.requirement.active) continue
      rows.push({ projectId: project.id, projectNumber: project.number, projectName: project.name, row })
    }
  }

  // Worst first: overdue by how far, then whatever is closest to falling due.
  const rank = (row: ComplianceDerived) =>
    row.status === 'OVERDUE' ? -1_000_000 + (row.daysUntilDue ?? 0) : (row.daysUntilDue ?? 9_999)
  rows.sort((a, b) => rank(a.row) - rank(b.row))

  return {
    rows,
    overdue: rows.filter((entry) => entry.row.status === 'OVERDUE').length,
    dueSoon: rows.filter((entry) => entry.row.status === 'DUE_SOON' || entry.row.status === 'DUE_TODAY').length,
    projectCount: projects.length,
  }
})
