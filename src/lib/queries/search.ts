import 'server-only'
import { prisma } from '@/lib/db'
import { can } from '@/lib/permissions'
import type { Role } from '@/generated/prisma/client'

/**
 * Search across the whole company, and inside one project.
 *
 * Results are grouped by what they are and every one carries a link, so the
 * search box is a way of getting somewhere rather than a report. Anything a
 * role cannot open is never returned: the same capabilities that gate the pages
 * gate the results, so search can never become a way around them.
 */

export type SearchKind =
  | 'Project'
  | 'Client'
  | 'Vendor'
  | 'Estimate'
  | 'Bid'
  | 'Change order'
  | 'Commitment'
  | 'Pay application'
  | 'Invoice'
  | 'Cost'
  | 'Budget line'
  | 'Report'
  | 'Cost code'
  | 'Setting'

export interface SearchHit {
  kind: SearchKind
  title: string
  subtitle?: string
  detail?: string
  href: string
}

export interface SearchResults {
  query: string
  hits: SearchHit[]
  truncated: boolean
}

/** Pages that are worth reaching by name rather than by navigating to them. */
const DESTINATIONS: { title: string; subtitle: string; href: string; needs?: Parameters<typeof can>[1] }[] = [
  { title: 'Company dashboard', subtitle: 'Portfolio position and alerts', href: '/' },
  { title: 'Projects', subtitle: 'Every job with its financial position', href: '/projects' },
  { title: 'Bid pipeline', subtitle: 'Opportunities and win rate', href: '/pipeline', needs: 'view:pipeline' },
  { title: 'Estimating', subtitle: 'Takeoff, leveling and bid build-up', href: '/estimating', needs: 'view:estimates' },
  { title: 'Reports', subtitle: 'Every report in one place', href: '/reports' },
  { title: 'Work in progress report', subtitle: 'The WIP schedule', href: '/reports/wip', needs: 'view:company_financials' },
  { title: 'Profitability report', subtitle: 'Forecast profit and margin', href: '/reports/profitability', needs: 'view:margins' },
  { title: 'Company cash flow report', subtitle: 'Collections against outflow', href: '/reports/cashflow', needs: 'view:cash_position' },
  { title: 'Budget vs actual report', subtitle: 'Every cost code on every project', href: '/reports/budget-vs-actual' },
  { title: 'Estimate at completion report', subtitle: 'Cost to complete by project', href: '/reports/eac' },
  { title: 'Change orders report', subtitle: 'Every change across the portfolio', href: '/reports/change-orders' },
  { title: 'Subcontractor payments report', subtitle: 'Invoiced, paid and outstanding', href: '/reports/subcontractors' },
  { title: 'Clients', subtitle: 'Owners you contract with', href: '/admin/clients', needs: 'manage:clients' },
  { title: 'Vendors and subcontractors', subtitle: 'Records, insurance and territory', href: '/admin/vendors', needs: 'manage:reference_data' },
  { title: 'Audit history', subtitle: 'Every change ever made', href: '/admin/audit', needs: 'view:audit' },
  { title: 'Users and roles', subtitle: 'Who can see and do what', href: '/admin/users', needs: 'manage:users' },
  { title: 'Backup and restore', subtitle: 'Export or rebuild a project', href: '/admin/restore', needs: 'edit:project_setup' },
]

const LIMIT_PER_KIND = 6
const TOTAL_LIMIT = 40

export async function searchEverything(
  companyId: string,
  role: Role,
  rawQuery: string,
): Promise<SearchResults> {
  const query = rawQuery.trim()
  if (query.length < 2) return { query, hits: [], truncated: false }

  const contains = query
  const hits: SearchHit[] = []

  const [projects, clients, vendors, estimates, bids, changeOrders, commitments, billings] = await Promise.all([
    prisma.project.findMany({
      where: {
        companyId,
        OR: [{ number: { contains } }, { name: { contains } }, { city: { contains } }, { projectType: { contains } }],
      },
      select: { id: true, number: true, name: true, status: true, client: { select: { name: true } } },
      take: LIMIT_PER_KIND,
      orderBy: { number: 'asc' },
    }),
    can(role, 'manage:clients')
      ? prisma.client.findMany({
          where: { companyId, OR: [{ name: { contains } }, { contact: { contains } }, { email: { contains } }] },
          select: { id: true, name: true, type: true, _count: { select: { projects: true } } },
          take: LIMIT_PER_KIND,
        })
      : Promise.resolve([]),
    prisma.vendor.findMany({
      where: {
        companyId,
        OR: [{ name: { contains } }, { contactName: { contains } }, { email: { contains } }],
      },
      select: {
        id: true,
        name: true,
        trade: { select: { name: true } },
        state: { select: { name: true } },
        region: { select: { name: true } },
      },
      take: LIMIT_PER_KIND,
    }),
    can(role, 'view:estimates')
      ? prisma.estimate.findMany({
          where: { companyId, OR: [{ name: { contains } }, { estimator: { contains } }] },
          select: { id: true, name: true, version: true, status: true },
          take: LIMIT_PER_KIND,
        })
      : Promise.resolve([]),
    can(role, 'view:pipeline')
      ? prisma.bid.findMany({
          where: { companyId, OR: [{ number: { contains } }, { name: { contains } }] },
          select: { id: true, number: true, name: true, status: true },
          take: LIMIT_PER_KIND,
        })
      : Promise.resolve([]),
    prisma.changeOrder.findMany({
      where: { project: { companyId }, OR: [{ number: { contains } }, { description: { contains } }] },
      select: { id: true, number: true, description: true, status: true, project: { select: { id: true, number: true } } },
      take: LIMIT_PER_KIND,
    }),
    prisma.commitment.findMany({
      where: {
        project: { companyId },
        OR: [{ number: { contains } }, { description: { contains } }, { vendor: { name: { contains } } }],
      },
      select: {
        id: true,
        number: true,
        vendor: { select: { name: true } },
        project: { select: { id: true, number: true } },
      },
      take: LIMIT_PER_KIND,
    }),
    prisma.ownerBilling.findMany({
      where: { project: { companyId }, OR: [{ notes: { contains } }, { project: { number: { contains } } }] },
      select: { id: true, appNumber: true, status: true, project: { select: { id: true, number: true } } },
      take: LIMIT_PER_KIND,
    }),
  ])

  for (const p of projects) {
    hits.push({
      kind: 'Project',
      title: `${p.number} ${p.name}`,
      subtitle: p.client?.name ?? 'No client',
      detail: p.status.replace(/_/g, ' ').toLowerCase(),
      href: `/projects/${p.id}`,
    })
  }
  for (const c of clients) {
    hits.push({
      kind: 'Client',
      title: c.name,
      subtitle: `${c._count.projects} project${c._count.projects === 1 ? '' : 's'}`,
      href: '/admin/clients',
    })
  }
  for (const v of vendors) {
    const where = [v.state?.name, v.region?.name].filter(Boolean).join(' / ')
    hits.push({
      kind: 'Vendor',
      title: v.name,
      subtitle: v.trade?.name ?? 'No trade',
      detail: where || 'Unassigned region',
      href: '/admin/vendors',
    })
  }
  for (const e of estimates) {
    hits.push({ kind: 'Estimate', title: `${e.name} v${e.version}`, subtitle: e.status.toLowerCase(), href: `/estimating/${e.id}` })
  }
  for (const b of bids) {
    hits.push({ kind: 'Bid', title: `${b.number} ${b.name}`, subtitle: b.status.replace(/_/g, ' ').toLowerCase(), href: '/pipeline' })
  }
  for (const co of changeOrders) {
    hits.push({
      kind: 'Change order',
      title: `${co.number} ${co.description}`,
      subtitle: `Job ${co.project.number}`,
      detail: co.status.replace(/_/g, ' ').toLowerCase(),
      href: `/projects/${co.project.id}/changes`,
    })
  }
  for (const c of commitments) {
    hits.push({
      kind: 'Commitment',
      title: `${c.number} ${c.vendor.name}`,
      subtitle: `Job ${c.project.number}`,
      href: `/projects/${c.project.id}/commitments`,
    })
  }
  for (const b of billings) {
    hits.push({
      kind: 'Pay application',
      title: `Application ${b.appNumber}`,
      subtitle: `Job ${b.project.number}`,
      detail: b.status.toLowerCase(),
      href: `/projects/${b.project.id}/billing?app=${b.appNumber}`,
    })
  }

  const lower = query.toLowerCase()
  for (const d of DESTINATIONS) {
    if (d.needs && !can(role, d.needs)) continue
    if (!d.title.toLowerCase().includes(lower) && !d.subtitle.toLowerCase().includes(lower)) continue
    hits.push({ kind: d.href.startsWith('/reports') ? 'Report' : 'Setting', title: d.title, subtitle: d.subtitle, href: d.href })
  }

  return { query, hits: hits.slice(0, TOTAL_LIMIT), truncated: hits.length > TOTAL_LIMIT }
}

// ── Inside one project ────────────────────────────────────────────────────

export interface ProjectSearchGroup {
  kind: string
  href: string
  hits: { title: string; subtitle?: string; detail?: string; href: string }[]
}

/**
 * Search within one job.
 *
 * Covers the records a manager actually hunts for: budget lines, costs,
 * commitments, change orders, pay applications, subcontractor invoices and
 * quantities, each linking straight to the tab it lives on.
 */
export async function searchProject(
  projectId: string,
  companyId: string,
  rawQuery: string,
): Promise<ProjectSearchGroup[]> {
  const query = rawQuery.trim()
  if (query.length < 2) return []
  const contains = query
  const base = `/projects/${projectId}`

  const [budget, costs, commitments, changes, billings, invoices, quantities] = await Promise.all([
    prisma.budgetLine.findMany({
      where: {
        projectId,
        project: { companyId },
        OR: [{ description: { contains } }, { notes: { contains } }, { costCode: { code: { contains } } }],
      },
      select: { id: true, description: true, originalBudget: true, category: true, costCode: { select: { code: true } } },
      take: 8,
    }),
    prisma.costTransaction.findMany({
      where: {
        projectId,
        project: { companyId },
        deletedAt: null,
        OR: [{ description: { contains } }, { reference: { contains } }, { vendor: { name: { contains } } }],
      },
      select: { id: true, description: true, amount: true, date: true, vendor: { select: { name: true } } },
      take: 8,
      orderBy: { date: 'desc' },
    }),
    prisma.commitment.findMany({
      where: {
        projectId,
        project: { companyId },
        OR: [{ number: { contains } }, { description: { contains } }, { vendor: { name: { contains } } }],
      },
      select: { id: true, number: true, originalAmount: true, vendor: { select: { name: true } } },
      take: 8,
    }),
    prisma.changeOrder.findMany({
      where: { projectId, project: { companyId }, OR: [{ number: { contains } }, { description: { contains } }] },
      select: { id: true, number: true, description: true, ownerAmount: true, status: true },
      take: 8,
    }),
    prisma.ownerBilling.findMany({
      where: { projectId, project: { companyId }, OR: [{ notes: { contains } }] },
      select: { id: true, appNumber: true, status: true },
      take: 8,
    }),
    prisma.subInvoice.findMany({
      where: {
        projectId,
        project: { companyId },
        OR: [{ invoiceNumber: { contains } }, { vendor: { name: { contains } } }],
      },
      select: { id: true, invoiceNumber: true, amount: true, vendor: { select: { name: true } } },
      take: 8,
    }),
    prisma.quantityItem.findMany({
      where: { projectId, project: { companyId }, OR: [{ description: { contains } }, { uom: { contains } }] },
      select: { id: true, description: true, budgetQty: true, uom: true },
      take: 8,
    }),
  ])

  const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
  const groups: ProjectSearchGroup[] = []

  if (budget.length)
    groups.push({
      kind: 'Budget lines',
      href: `${base}/budget`,
      hits: budget.map((b) => ({
        title: `${b.costCode?.code ? `${b.costCode.code} ` : ''}${b.description}`,
        subtitle: b.category.replace(/_/g, ' ').toLowerCase(),
        detail: money(b.originalBudget),
        href: `${base}/budget`,
      })),
    })
  if (costs.length)
    groups.push({
      kind: 'Cost transactions',
      href: `${base}/costs`,
      hits: costs.map((c) => ({
        title: c.description,
        subtitle: c.vendor?.name ?? 'No vendor',
        detail: money(c.amount),
        href: `${base}/costs`,
      })),
    })
  if (commitments.length)
    groups.push({
      kind: 'Commitments',
      href: `${base}/commitments`,
      hits: commitments.map((c) => ({
        title: `${c.number} ${c.vendor.name}`,
        detail: money(c.originalAmount),
        href: `${base}/commitments`,
      })),
    })
  if (changes.length)
    groups.push({
      kind: 'Change orders',
      href: `${base}/changes`,
      hits: changes.map((c) => ({
        title: `${c.number} ${c.description}`,
        subtitle: c.status.replace(/_/g, ' ').toLowerCase(),
        detail: money(c.ownerAmount),
        href: `${base}/changes`,
      })),
    })
  if (billings.length)
    groups.push({
      kind: 'Pay applications',
      href: `${base}/billing`,
      hits: billings.map((b) => ({
        title: `Application ${b.appNumber}`,
        subtitle: b.status.toLowerCase(),
        href: `${base}/billing?app=${b.appNumber}`,
      })),
    })
  if (invoices.length)
    groups.push({
      kind: 'Subcontractor invoices',
      href: `${base}/subs`,
      hits: invoices.map((i) => ({
        title: `${i.invoiceNumber} ${i.vendor.name}`,
        detail: money(i.amount),
        href: `${base}/subs`,
      })),
    })
  if (quantities.length)
    groups.push({
      kind: 'Quantities',
      href: `${base}/quantities`,
      hits: quantities.map((q) => ({
        title: q.description,
        detail: `${q.budgetQty.toLocaleString('en-US')} ${q.uom}`,
        href: `${base}/quantities`,
      })),
    })

  return groups
}
