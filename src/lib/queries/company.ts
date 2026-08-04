import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { getProjectBundle } from './project'
import {
  aggregateCashFlow,
  buildRevenueForecast,
  buildWipSchedule,
  rollupPipeline,
  rollupPortfolio,
  sortAlerts,
  type Alert,
  type PipelineRow,
  type PortfolioTotals,
  type ProjectRow,
} from '@/lib/finance'

export interface ProjectFilter {
  status?: string[]
  pmUserId?: string
  clientId?: string
  projectType?: string
  location?: string
  health?: ('OK' | 'WATCH' | 'HIGH RISK')[]
  /** Narrows line-level reports to one or more general cost types. */
  costType?: string[]
}

export interface CompanyDashboardData {
  company: NonNullable<Awaited<ReturnType<typeof loadCompany>>>
  projects: ProjectRow[]
  totals: PortfolioTotals
  pipeline: ReturnType<typeof rollupPipeline>
  pipelineRows: PipelineRow[]
  cashFlow: ReturnType<typeof aggregateCashFlow>
  revenueForecast: ReturnType<typeof buildRevenueForecast>
  wip: ReturnType<typeof buildWipSchedule>
  alerts: Alert[]
  monthlyActuals: Awaited<ReturnType<typeof loadMonthlyActuals>>
  arAging: Awaited<ReturnType<typeof loadArAging>>
  filterOptions: {
    managers: { id: string; name: string }[]
    clients: { id: string; name: string }[]
    projectTypes: string[]
    locations: string[]
  }
}

function loadCompany(companyId: string) {
  return prisma.company.findUnique({ where: { id: companyId } })
}

function loadMonthlyActuals(companyId: string) {
  return prisma.companyMonthly.findMany({ where: { companyId }, orderBy: { month: 'asc' } })
}

function loadArAging(companyId: string) {
  return prisma.arAgingBucket.findMany({
    where: { companyId },
    orderBy: [{ asOf: 'desc' }, { sortOrder: 'asc' }],
  })
}

/**
 * Builds the whole company picture by computing each project through the same
 * engine the project pages use, then aggregating. Slower than a SQL sum, and
 * deliberately so: it is the only way the executive view can never disagree
 * with the project view.
 */
export const getCompanyDashboard = cache(
  async (companyId: string, filter: ProjectFilter = {}): Promise<CompanyDashboardData> => {
    const [company, projectRecords, bidRecords, monthlyActuals, arAging, managers, clients] =
      await Promise.all([
        loadCompany(companyId),
        prisma.project.findMany({
          where: {
            companyId,
            ...(filter.status?.length ? { status: { in: filter.status as never } } : {}),
            ...(filter.pmUserId ? { pmUserId: filter.pmUserId } : {}),
            ...(filter.clientId ? { clientId: filter.clientId } : {}),
            ...(filter.projectType ? { projectType: filter.projectType } : {}),
            ...(filter.location ? { city: filter.location } : {}),
          },
          include: { client: true, pm: true },
          orderBy: { number: 'asc' },
        }),
        prisma.bid.findMany({ where: { companyId }, include: { client: true }, orderBy: { bidDue: 'asc' } }),
        loadMonthlyActuals(companyId),
        loadArAging(companyId),
        prisma.user.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
        prisma.client.findMany({ where: { companyId }, select: { id: true, name: true } }),
      ])

    if (!company) throw new Error('Company not found')

    const bundles = await Promise.all(
      projectRecords.map((p) => getProjectBundle(p.id, companyId)),
    )

    let projects: ProjectRow[] = bundles
      .filter((b): b is NonNullable<typeof b> => b != null)
      .map((b) => ({
        id: b.project.id,
        number: b.project.number,
        name: b.project.name,
        clientName: b.project.client?.name ?? null,
        clientId: b.project.clientId,
        location: [b.project.city, b.project.state].filter(Boolean).join(', ') || null,
        projectType: b.project.projectType,
        pmName: b.project.pm?.name ?? null,
        pmUserId: b.project.pmUserId,
        status: b.project.status,
        contractStart: b.project.contractStart,
        contractCompletion: b.project.contractCompletion,
        forecastCompletion: b.project.forecastCompletion,
        financials: b.financials,
      }))

    if (filter.health?.length) {
      projects = projects.filter((p) => filter.health!.includes(p.financials.health.flag))
    }

    const totals = rollupPortfolio(projects, company.targetMarginPct)

    const pipelineRows: PipelineRow[] = bidRecords.map((b) => ({
      id: b.id,
      number: b.number,
      name: b.name,
      clientName: b.client?.name ?? null,
      status: b.status,
      estimatedValue: b.estimatedValue,
      submittedAmount: b.submittedAmount,
      winProbability: b.winProbability,
      bidDue: b.bidDue,
      nextFollowUp: b.nextFollowUp,
      decisionDate: b.decisionDate,
      estimator: b.estimator,
      clientType: b.clientType,
      leadSource: b.leadSource,
    }))

    const asOf = projectRecords[0]?.dataDate ?? new Date()
    const includedIds = new Set(projects.map((p) => p.id))
    const includedBundles = bundles.filter(
      (b): b is NonNullable<typeof b> => b != null && includedIds.has(b.project.id),
    )

    const cashFlow = aggregateCashFlow(includedBundles.map((b) => b.cashFlow))

    const revenueForecast = buildRevenueForecast(
      includedBundles.map((b) => ({
        contractValue: b.financials.contract.currentContract,
        forecastCost: b.financials.forecastCost,
        rows: b.cashFlow.map((r) => ({ periodEnd: r.periodEnd, totalCost: r.totalCost })),
      })),
      company.defaultOverheadPct,
    )

    const alerts = sortAlerts(includedBundles.flatMap((b) => b.alerts))

    return {
      company,
      projects,
      totals,
      pipeline: rollupPipeline(pipelineRows, asOf),
      pipelineRows,
      cashFlow,
      revenueForecast,
      wip: buildWipSchedule(projects),
      alerts,
      monthlyActuals,
      arAging,
      filterOptions: {
        managers,
        clients,
        projectTypes: [...new Set(projectRecords.map((p) => p.projectType).filter(Boolean))] as string[],
        locations: [...new Set(projectRecords.map((p) => p.city).filter(Boolean))] as string[],
      },
    }
  },
)

export function parseProjectFilter(searchParams: Record<string, string | string[] | undefined>): ProjectFilter {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const many = (v: string | string[] | undefined): string[] | undefined => {
    if (!v) return undefined
    const value = Array.isArray(v) ? v : v.split(',')
    return value.filter(Boolean)
  }
  return {
    status: many(searchParams.status),
    pmUserId: first(searchParams.pm) || undefined,
    clientId: first(searchParams.client) || undefined,
    projectType: first(searchParams.type) || undefined,
    location: first(searchParams.location) || undefined,
    health: many(searchParams.health) as ProjectFilter['health'],
    costType: many(searchParams.costType),
  }
}
