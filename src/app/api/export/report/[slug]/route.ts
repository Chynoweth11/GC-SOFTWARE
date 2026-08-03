import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getCompanyDashboard, parseProjectFilter } from '@/lib/queries/company'
import { listEstimates } from '@/lib/queries/estimate'
import { buildWipSchedule, followUpState, rollupByDimension } from '@/lib/finance'
import { buildWorkbook, workbookResponse, type SheetSpec } from '@/lib/excel'
import { titleize } from '@/lib/format'

/**
 * Excel export for every report. Reads the same engine output the on-screen
 * report reads, so the workbook and the page can never disagree.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { slug } = await params
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries())
  const filter = parseProjectFilter(searchParams)
  const data = await getCompanyDashboard(user.companyId, filter)
  const showMargins = can(user.role, 'view:margins')

  const asOf = new Date().toISOString().slice(0, 10)
  const notes = (title: string) => [
    `${title} — ${data.company.name}`,
    `Generated ${asOf} · ${data.projects.length} projects in view`,
  ]

  let sheets: SheetSpec[] = []
  let filename = `constructx-${slug}-${asOf}.xlsx`

  switch (slug) {
    case 'wip': {
      if (!can(user.role, 'view:company_financials')) return new Response('Forbidden', { status: 403 })
      const wip = buildWipSchedule(data.projects)
      sheets = [
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
          rows: wip as unknown as Record<string, string | number>[],
        },
      ]
      break
    }

    case 'budget-vs-actual':
    case 'committed': {
      sheets = [
        {
          name: slug === 'committed' ? 'Budget vs committed' : 'Budget vs actual',
          notes: notes(slug === 'committed' ? 'Budget vs committed' : 'Budget vs actual vs forecast'),
          totalsRow: true,
          columns: [
            { header: 'Job', key: 'job', width: 12 },
            { header: 'Project', key: 'project', width: 26 },
            { header: 'Cost code', key: 'code', width: 14 },
            { header: 'Description', key: 'description', width: 32 },
            { header: 'Category', key: 'category', width: 18 },
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
            p.financials.lines.map((l) => ({
              job: p.number,
              project: p.name,
              code: l.code,
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
      ]
      break
    }

    case 'eac': {
      sheets = [
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
      ]
      break
    }

    case 'profitability': {
      if (!showMargins) return new Response('Forbidden', { status: 403 })
      sheets = [
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
          rows: rollupByDimension(data.projects, dimension) as unknown as Record<string, string | number>[],
        })),
      ]
      break
    }

    case 'billing-position':
    case 'backlog': {
      sheets = [
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
      ]
      break
    }

    case 'cashflow': {
      if (!can(user.role, 'view:cash_position')) return new Response('Forbidden', { status: 403 })
      sheets = [
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
          rows: data.cashFlow as unknown as Record<string, string | number | Date>[],
        },
      ]
      break
    }

    case 'subcontractors': {
      const commitments = await prisma.commitment.findMany({
        where: { project: { companyId: user.companyId }, type: 'SUBCONTRACT' },
        include: { vendor: true, project: true, invoices: true, changes: true },
        orderBy: [{ project: { number: 'asc' } }, { number: 'asc' }],
      })
      sheets = [
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
      ]
      break
    }

    case 'change-orders': {
      const orders = await prisma.changeOrder.findMany({
        where: { project: { companyId: user.companyId } },
        include: { project: true, trade: true },
        orderBy: [{ project: { number: 'asc' } }, { number: 'asc' }],
      })
      sheets = [
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
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Owner amount', key: 'ownerAmount', format: 'money', total: true },
            { header: 'Cost amount', key: 'costAmount', format: 'money', total: true },
            ...(showMargins ? ([{ header: 'Margin', key: 'margin', format: 'money', total: true }] as const) : []),
            { header: 'Probability', key: 'probability', format: 'percent' },
            { header: 'Initiated', key: 'dateInitiated', format: 'date' },
            { header: 'Approved', key: 'dateApproved', format: 'date' },
            { header: 'Schedule days', key: 'scheduleDays', format: 'number' },
          ],
          rows: orders.map((co) => ({
            job: co.project.number,
            number: co.number,
            description: co.description,
            type: titleize(co.type),
            trade: co.trade?.name ?? '',
            status: titleize(co.status),
            ownerAmount: co.ownerAmount,
            costAmount: co.costAmount,
            margin: co.ownerAmount - co.costAmount,
            probability: co.probabilityPct,
            dateInitiated: co.dateInitiated,
            dateApproved: co.dateApproved,
            scheduleDays: co.scheduleImpactDays,
          })),
        },
      ]
      break
    }

    case 'buyout': {
      const packages = await prisma.bidPackage.findMany({
        where: { OR: [{ project: { companyId: user.companyId } }, { estimate: { companyId: user.companyId } }] },
        include: { project: true, estimate: true, awardedVendor: true },
      })
      sheets = [
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
      ]
      break
    }

    case 'bid-summary': {
      const estimates = await listEstimates(user.companyId)
      sheets = [
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
      ]
      break
    }

    case 'pipeline': {
      const asOfDate = new Date()
      sheets = [
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
      ]
      break
    }

    default:
      return new Response('Unknown report', { status: 404 })
  }

  filename = `constructx-${slug}-${asOf}.xlsx`
  const workbook = buildWorkbook(sheets, { title: slug, company: data.company.name })
  return workbookResponse(workbook, filename)
}
