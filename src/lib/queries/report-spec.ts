import 'server-only'
import { can, type Capability } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getCompanyDashboard, parseProjectFilter, type CompanyDashboardData } from '@/lib/queries/company'
import { listEstimates } from '@/lib/queries/estimate'
import { getProjectDocuments } from '@/lib/queries/documents'
import { buildWipSchedule, followUpState, rollupByDimension } from '@/lib/finance'
import type { SheetSpec } from '@/lib/excel'
import type { Role } from '@/generated/prisma'
import { titleize } from '@/lib/format'

/**
 * The single definition of what each report contains.
 *
 * The on-screen report, the Excel workbook and the PDF are all rendered from
 * this one spec, which is what stops the three from drifting apart. Adding a
 * column here adds it everywhere; there is nowhere else to add it.
 */

export const REPORT_TITLES: Record<string, { title: string; description: string }> = {
  wip: { title: 'Work in progress', description: 'Percentage-of-completion schedule across the portfolio' },
  'budget-vs-actual': { title: 'Budget vs actual vs forecast', description: 'Every line item on every project' },
  committed: { title: 'Budget vs committed', description: 'Commitment coverage and exposure by line item' },
  eac: { title: 'Estimate at completion', description: 'Cost to complete and EAC by project' },
  profitability: { title: 'Profitability', description: 'Forecast profit and margin by project and by dimension' },
  'billing-position': { title: 'Over / underbilling', description: 'Earned revenue against amount billed' },
  backlog: { title: 'Backlog', description: 'Revenue still to be earned by project' },
  cashflow: { title: 'Company cash flow', description: 'Monthly collections against outflow across every project' },
  subcontractors: {
    title: 'Subcontractor payments',
    description: 'Contract, invoiced, paid, retention and outstanding across all projects',
  },
  'change-orders': { title: 'Change orders', description: 'Every change order across the portfolio' },
  buyout: { title: 'Buyout', description: 'Budget against award on every package' },
  'bid-summary': { title: 'Bid summaries', description: 'Every estimate with its direct cost and final bid' },
  pipeline: { title: 'Pipeline and win rate', description: 'Opportunities by stage with follow-up state' },
}

/**
 * What a role must hold to open each report: on screen, as a workbook, and as
 * a PDF alike.
 *
 * One map, because the report card, the page and both exports all read it. When
 * this lived in three places the page showed a read-only user the profitability
 * report in full while the export correctly refused it.
 */
export const REPORT_REQUIRES: Partial<Record<string, Capability>> = {
  wip: 'view:company_financials',
  profitability: 'view:margins',
  'billing-position': 'view:company_financials',
  cashflow: 'view:cash_position',
}

/** True when the role may open this report at all. */
export function canOpenReport(role: Role, slug: string): boolean {
  const required = REPORT_REQUIRES[slug]
  return !required || can(role, required)
}

export type ReportSpec =
  | { ok: true; slug: string; title: string; description: string; sheets: SheetSpec[]; data: CompanyDashboardData }
  | { ok: false; status: 403 | 404; message: string }

export async function buildReportSpec(
  slug: string,
  user: { companyId: string; role: Role },
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ReportSpec> {
  const meta = REPORT_TITLES[slug]
  if (!meta) return { ok: false, status: 404, message: 'Unknown report' }
  if (!canOpenReport(user.role, slug)) {
    return { ok: false, status: 403, message: 'Your role is not permitted to open this report' }
  }

  const filter = parseProjectFilter(searchParams)
  const data = await getCompanyDashboard(user.companyId, filter)
  const showMargins = can(user.role, 'view:margins')

  const asOf = new Date().toISOString().slice(0, 10)
  const notes = (title: string) => [
    `${title}: ${data.company.name}`,
    `Generated ${asOf} · ${data.projects.length} projects in view`,
  ]

  const done = (sheets: SheetSpec[]): ReportSpec => ({
    ok: true,
    slug,
    title: meta.title,
    description: meta.description,
    sheets,
    data,
  })
  switch (slug) {
    case 'wip': {
      return done([
        {
          name: 'Work in progress',
          notes: notes('Work-in-progress schedule'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'number', width: 12 },
            { header: 'Project', key: 'name', width: 30 },
            { header: 'Contract value', key: 'contractValue', format: 'money', total: true },
            { header: 'Forecast cost', key: 'forecastCost', format: 'money', total: true },
            ...(showMargins
              ? ([
                  { header: 'Forecast profit', key: 'forecastProfit', format: 'money', total: true },
                  { header: 'Margin', key: 'forecastMargin', format: 'percent' },
                ] as const)
              : []),
            { header: 'Cost to date', key: 'costToDate', format: 'money', total: true },
            { header: '% complete', key: 'pctComplete', format: 'percent' },
            { header: 'Revenue earned', key: 'revenueEarned', format: 'money', total: true },
            { header: 'Billed to date', key: 'billedToDate', format: 'money', total: true },
            { header: 'Overbilled', key: 'overbilled', format: 'money', total: true },
            { header: 'Underbilled', key: 'underbilled', format: 'money', total: true },
            ...(showMargins ? ([{ header: 'Profit earned', key: 'profitEarned', format: 'money', total: true }] as const) : []),
          ],
          rows: buildWipSchedule(data.projects) as unknown as SheetSpec['rows'],
        },
      ])
    }

    case 'budget-vs-actual':
    case 'committed': {
      return done([
        {
          name: slug === 'committed' ? 'Budget vs committed' : 'Budget vs actual',
          notes: notes(slug === 'committed' ? 'Budget vs committed' : 'Budget vs actual vs forecast'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'job', width: 12 },
            { header: 'Project', key: 'project', width: 26 },
            { header: 'Line item', key: 'description', width: 34 },
            { header: 'Cost type', key: 'category', width: 18 },
            { header: 'Trade', key: 'trade', width: 22 },
            { header: 'Original budget', key: 'originalBudget', format: 'money', total: true },
            { header: 'Revisions', key: 'budgetRevisions', format: 'money', total: true },
            { header: 'Current budget', key: 'currentBudget', format: 'money', total: true },
            { header: 'Committed', key: 'committed', format: 'money', total: true },
            { header: 'Cost to date', key: 'costToDate', format: 'money', total: true },
            { header: '% spent', key: 'pctSpent', format: 'percent' },
            { header: '% complete', key: 'pctComplete', format: 'percent' },
            { header: 'Earned value', key: 'earnedValue', format: 'money', total: true },
            { header: 'Forecast to complete', key: 'forecastToComplete', format: 'money', total: true },
            { header: 'Forecast at completion', key: 'forecastAtCompletion', format: 'money', total: true },
            { header: 'FAC variance', key: 'facVariance', format: 'money', total: true },
          ],
          rows: data.projects.flatMap((p) =>
            p.financials.lines
              .filter((l) => !filter.costType?.length || filter.costType.includes(l.category))
              .map((l) => ({
              job: p.number,
              project: p.name,
              description: l.description,
              category: titleize(l.category),
              trade: l.tradeName ?? '',
              originalBudget: l.originalBudget,
              budgetRevisions: l.budgetRevisions,
              currentBudget: l.currentBudget,
              committed: l.committed,
              costToDate: l.totalCostToDate,
              pctSpent: l.pctSpent,
              pctComplete: l.effectivePctComplete,
              earnedValue: l.earnedValue,
              forecastToComplete: l.forecastToComplete,
              forecastAtCompletion: l.forecastAtCompletion,
              facVariance: l.facVariance,
            })),
          ),
        },
      ])
    }

    case 'eac': {
      return done([
        {
          name: 'Estimate at completion',
          notes: notes('Estimate at completion'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'number', width: 12 },
            { header: 'Project', key: 'name', width: 30 },
            { header: 'Current budget', key: 'currentBudget', format: 'money', total: true },
            { header: 'Cost to date', key: 'costToDate', format: 'money', total: true },
            { header: 'Bottom-up EAC', key: 'bottomUp', format: 'money', total: true },
            { header: 'CPI-based EAC', key: 'cpiBased', format: 'money', total: true },
            { header: 'Budget-rate EAC', key: 'budgetRate', format: 'money', total: true },
            { header: 'Method in use', key: 'method', width: 18 },
            { header: 'Selected EAC', key: 'selected', format: 'money', total: true },
            { header: 'Estimate to complete', key: 'etc', format: 'money', total: true },
            { header: 'Variance at completion', key: 'vac', format: 'money', total: true },
          ],
          rows: data.projects.map((p) => ({
            number: p.number,
            name: p.name,
            currentBudget: p.financials.currentBudget,
            costToDate: p.financials.totalCostToDate,
            bottomUp: p.financials.eac.bottomUp,
            cpiBased: p.financials.eac.cpiBased,
            budgetRate: p.financials.eac.budgetRate,
            method: titleize(p.financials.eac.method),
            selected: p.financials.eac.selected,
            etc: p.financials.eac.estimateToComplete,
            vac: p.financials.eac.varianceAtCompletion,
          })),
        },
      ])
    }

    case 'profitability': {
      return done([
        {
          name: 'By project',
          notes: notes('Profitability by project'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'number', width: 12 },
            { header: 'Project', key: 'name', width: 30 },
            { header: 'Manager', key: 'pm', width: 18 },
            { header: 'Client', key: 'client', width: 24 },
            { header: 'Contract', key: 'contract', format: 'money', total: true },
            { header: 'Forecast cost', key: 'forecastCost', format: 'money', total: true },
            { header: 'Forecast profit', key: 'forecastProfit', format: 'money', total: true },
            { header: 'Margin', key: 'margin', format: 'percent' },
            { header: 'Profit earned to date', key: 'profitEarned', format: 'money', total: true },
            { header: 'Backlog', key: 'backlog', format: 'money', total: true },
            { header: 'Health', key: 'health', width: 12 },
          ],
          rows: data.projects.map((p) => ({
            number: p.number,
            name: p.name,
            pm: p.pmName ?? '',
            client: p.clientName ?? '',
            contract: p.financials.contract.currentContract,
            forecastCost: p.financials.forecastCost,
            forecastProfit: p.financials.forecastProfit,
            margin: p.financials.forecastMargin,
            profitEarned: p.financials.forecastProfit * p.financials.revenue.pctComplete,
            backlog: p.financials.backlog,
            health: p.financials.health.flag,
          })),
        },
        ...(['pm', 'client', 'projectType'] as const).map((dimension) => ({
          name: dimension === 'pm' ? 'By manager' : dimension === 'client' ? 'By client' : 'By project type',
          totalsRow: true,
          columns: [
            { header: 'Group', key: 'label', width: 28 },
            { header: 'Projects', key: 'projectCount', format: 'number' as const },
            { header: 'Contract value', key: 'contractValue', format: 'money' as const, total: true },
            { header: 'Cost to date', key: 'costToDate', format: 'money' as const, total: true },
            { header: 'Forecast profit', key: 'forecastProfit', format: 'money' as const, total: true },
            { header: 'Margin', key: 'margin', format: 'percent' as const },
            { header: 'Backlog', key: 'backlog', format: 'money' as const, total: true },
          ],
          rows: rollupByDimension(data.projects, dimension) as unknown as SheetSpec['rows'],
        })),
      ])
    }

    case 'billing-position':
    case 'backlog': {
      return done([
        {
          name: slug === 'backlog' ? 'Backlog' : 'Billing position',
          notes: notes(slug === 'backlog' ? 'Backlog' : 'Over / underbilling'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'number', width: 12 },
            { header: 'Project', key: 'name', width: 30 },
            { header: 'Contract', key: 'contract', format: 'money', total: true },
            { header: '% complete', key: 'pctComplete', format: 'percent' },
            { header: 'Revenue earned', key: 'revenueEarned', format: 'money', total: true },
            { header: 'Billed to date', key: 'billed', format: 'money', total: true },
            { header: 'Overbilled', key: 'overbilled', format: 'money', total: true },
            { header: 'Underbilled', key: 'underbilled', format: 'money', total: true },
            { header: 'Collected', key: 'collected', format: 'money', total: true },
            { header: 'Accounts receivable', key: 'ar', format: 'money', total: true },
            { header: 'Retention held', key: 'retention', format: 'money', total: true },
            { header: 'Backlog', key: 'backlog', format: 'money', total: true },
          ],
          rows: data.projects.map((p) => ({
            number: p.number,
            name: p.name,
            contract: p.financials.contract.currentContract,
            pctComplete: p.financials.revenue.pctComplete,
            revenueEarned: p.financials.revenue.revenueEarned,
            billed: p.financials.billing.totalCompletedAndStored,
            overbilled: p.financials.revenue.overbilled,
            underbilled: p.financials.revenue.underbilled,
            collected: p.financials.billing.amountCollected,
            ar: p.financials.billing.accountsReceivable,
            retention: p.financials.retentionReceivable,
            backlog: p.financials.backlog,
          })),
        },
      ])
    }

    case 'cashflow': {
      return done([
        {
          name: 'Company cash flow',
          notes: notes('Company cash flow'),
          totalsRow: true,
          columns: [
            { header: 'Month end', key: 'periodEnd', format: 'date', width: 14 },
            { header: 'Billings', key: 'billings', format: 'money', total: true },
            { header: 'Collections', key: 'collections', format: 'money', total: true },
            { header: 'Cost outflow', key: 'costs', format: 'money', total: true },
            { header: 'Net cash', key: 'netCash', format: 'money', total: true },
            { header: 'Cumulative cash', key: 'cumulativeCash', format: 'money' },
          ],
          rows: data.cashFlow as unknown as SheetSpec['rows'],
        },
      ])
    }

    case 'subcontractors': {
      const commitments = await prisma.commitment.findMany({
        where: { project: { companyId: user.companyId }, type: 'SUBCONTRACT' },
        include: { vendor: true, project: true, invoices: true, changes: true },
        orderBy: [{ project: { number: 'asc' } }, { number: 'asc' }],
      })
      return done([
        {
          name: 'Subcontractor payments',
          notes: notes('Subcontractor payments'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'job', width: 12 },
            { header: 'Subcontractor', key: 'vendor', width: 28 },
            { header: 'Contract', key: 'number', width: 18 },
            { header: 'Original', key: 'original', format: 'money', total: true },
            { header: 'Approved changes', key: 'approved', format: 'money', total: true },
            { header: 'Current value', key: 'current', format: 'money', total: true },
            { header: '% complete', key: 'pctComplete', format: 'percent' },
            { header: 'Invoiced', key: 'invoiced', format: 'money', total: true },
            { header: 'Paid', key: 'paid', format: 'money', total: true },
            { header: 'Retention held', key: 'retention', format: 'money', total: true },
            { header: 'Outstanding', key: 'outstanding', format: 'money', total: true },
            { header: 'Balance to complete', key: 'balance', format: 'money', total: true },
          ],
          rows: commitments.map((c) => {
            const approved = c.changes.filter((ch) => ch.status === 'APPROVED').reduce((a, ch) => a + ch.amount, 0)
            const current = c.originalAmount + approved
            const invoiced = c.invoices.reduce((a, i) => a + i.amount, 0)
            const paid = c.invoices.reduce((a, i) => a + i.amountPaid, 0)
            const retention = c.invoices.reduce((a, i) => a + i.amount * i.retentionPct, 0)
            return {
              job: c.project.number,
              vendor: c.vendor.name,
              number: c.number,
              original: c.originalAmount,
              approved,
              current,
              pctComplete: c.pctComplete,
              invoiced,
              paid,
              retention,
              outstanding: invoiced - retention - paid,
              balance: current - current * c.pctComplete,
            }
          }),
        },
      ])
    }

    case 'change-orders': {
      /*
        Priced through the same engine as the project page, which is what keeps
        the export honest about approval: the amount is stated for every
        document, and a column says plainly which ones are actually in the
        contract value.
      */
      const projectIds = await prisma.project.findMany({
        where: { companyId: user.companyId },
        select: { id: true, number: true },
        orderBy: { number: 'asc' },
      })
      const orders = (
        await Promise.all(
          projectIds.map(async (project) => {
            const { documents } = await getProjectDocuments(project.id, user.companyId)
            return documents
          }),
        )
      ).flat()
      return done([
        {
          name: 'Change orders',
          notes: notes('Change orders'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'job', width: 12 },
            { header: 'Number', key: 'number', width: 14 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Type', key: 'type', width: 20 },
            { header: 'Trade', key: 'trade', width: 22 },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Approved and signed', key: 'approved', width: 20 },
            { header: 'Owner amount', key: 'ownerAmount', format: 'money', total: true },
            { header: 'Cost amount', key: 'costAmount', format: 'money', total: true },
            ...(showMargins ? ([{ header: 'Margin', key: 'margin', format: 'money', total: true }] as const) : []),
            { header: 'Probability', key: 'probability', format: 'percent' },
            { header: 'Initiated', key: 'dateInitiated', format: 'date' },
            { header: 'Approved', key: 'dateApproved', format: 'date' },
            { header: 'Schedule days', key: 'scheduleDays', format: 'number' },
          ],
          rows: orders.map((co: (typeof orders)[number]) => ({
            job: co.projectNumber,
            number: co.number,
            description: co.description,
            type: titleize(co.type),
            trade: co.tradeName ?? '',
            status: titleize(co.status),
            ownerAmount: co.ownerAmount,
            costAmount: co.costAmount,
            approved: co.isOfficial ? 'Yes' : 'No',
            margin: co.margin,
            probability: co.probabilityPct,
            dateInitiated: co.dateInitiated,
            dateApproved: co.dateApproved,
            scheduleDays: co.scheduleImpactDays,
          })),
        },
      ])
    }

    case 'buyout': {
      const packages = await prisma.bidPackage.findMany({
        where: { OR: [{ project: { companyId: user.companyId } }, { estimate: { companyId: user.companyId } }] },
        include: { project: true, estimate: true, awardedVendor: true },
      })
      return done([
        {
          name: 'Buyout',
          notes: notes('Buyout'),
          totalsRow: true,
          columns: [
            { header: 'Where', key: 'where', width: 26 },
            { header: 'Package', key: 'name', width: 28 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Budget', key: 'budget', format: 'money', total: true },
            { header: 'Award', key: 'award', format: 'money', total: true },
            { header: 'Savings', key: 'savings', format: 'money', total: true },
            { header: 'Awarded to', key: 'vendor', width: 26 },
          ],
          rows: packages.map((p) => ({
            where: p.project ? p.project.number : p.estimate ? `Estimate: ${p.estimate.name}` : '',
            name: p.name,
            status: titleize(p.status),
            budget: p.budgetAmount,
            award: p.awardAmount,
            savings: p.awardAmount > 0 ? p.budgetAmount - p.awardAmount : 0,
            vendor: p.awardedVendor?.name ?? '',
          })),
        },
      ])
    }

    case 'bid-summary': {
      const estimates = await listEstimates(user.companyId)
      return done([
        {
          name: 'Bid summaries',
          notes: notes('Bid summaries'),
          totalsRow: true,
          columns: [
            { header: 'Estimate', key: 'name', width: 32 },
            { header: 'Version', key: 'version', format: 'number' },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Client', key: 'client', width: 26 },
            { header: 'Bid due', key: 'bidDueDate', format: 'date' },
            { header: 'Direct cost', key: 'directCost', format: 'money', total: true },
            { header: 'Total bid', key: 'totalBid', format: 'money', total: true },
            { header: 'Margin', key: 'margin', format: 'percent' },
            { header: 'QA issues', key: 'qaIssues', format: 'number' },
          ],
          rows: estimates.map((e) => ({
            name: e.name,
            version: e.version,
            status: titleize(e.status),
            client: e.clientName ?? '',
            bidDueDate: e.bidDueDate,
            directCost: e.directCost,
            totalBid: e.totalBid,
            margin: e.margin,
            qaIssues: e.qaIssues,
          })),
        },
      ])
    }

    case 'pipeline': {
      const asOfDate = new Date()
      return done([
        {
          name: 'Pipeline',
          notes: notes('Bid pipeline'),
          totalsRow: true,
          columns: [
            { header: 'Bid', key: 'number', width: 14 },
            { header: 'Opportunity', key: 'name', width: 32 },
            { header: 'Client', key: 'client', width: 26 },
            { header: 'Status', key: 'status', width: 18 },
            { header: 'Estimator', key: 'estimator', width: 16 },
            { header: 'Bid due', key: 'bidDue', format: 'date' },
            { header: 'Estimated value', key: 'estimatedValue', format: 'money', total: true },
            { header: 'Submitted', key: 'submittedAmount', format: 'money', total: true },
            { header: 'Win probability', key: 'winProbability', format: 'percent' },
            { header: 'Weighted', key: 'weighted', format: 'money', total: true },
            { header: 'Follow-up', key: 'followUp', width: 14 },
            { header: 'Decision date', key: 'decisionDate', format: 'date' },
          ],
          rows: data.pipelineRows.map((r) => ({
            number: r.number,
            name: r.name,
            client: r.clientName ?? '',
            status: titleize(r.status),
            estimator: r.estimator ?? '',
            bidDue: r.bidDue,
            estimatedValue: r.estimatedValue,
            submittedAmount: r.submittedAmount,
            winProbability: r.winProbability,
            weighted: (r.submittedAmount || r.estimatedValue) * r.winProbability,
            followUp: followUpState(r, asOfDate),
            decisionDate: r.decisionDate,
          })),
        },
      ])
    }

    default:
      return { ok: false, status: 404, message: 'Unknown report' }
  }
}
