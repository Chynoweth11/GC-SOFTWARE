import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { canOpenReport } from '@/lib/queries/report-spec'
import { PageHeader, Section } from '@/components/ui'

export const metadata = { title: 'Reports' }

interface ReportCard {
  slug: string
  title: string
  description: string
}

const REPORTS: { group: string; items: ReportCard[] }[] = [
  {
    group: 'Financial position',
    items: [
      { slug: 'wip', title: 'Work in progress', description: 'The WIP schedule a bonding agent asks for: contract, cost, earned revenue, over and underbilling, and profit by project.' },
      { slug: 'budget-vs-actual', title: 'Budget vs actual vs forecast', description: 'Every cost code on every project: budget, committed, actual, forecast and variance.' },
      { slug: 'committed', title: 'Budget vs committed', description: 'Where commitments sit against budget, and the exposure where cost is posting without one.' },
      { slug: 'eac', title: 'Estimate at completion', description: 'Cost to complete and EAC by project under each method, with variance at completion.' },
    ],
  },
  {
    group: 'Profitability and revenue',
    items: [
      { slug: 'profitability', title: 'Profitability', description: 'Forecast profit and margin by project, manager, client and type.' },
      { slug: 'billing-position', title: 'Over / underbilling', description: 'Earned revenue against billed, project by project.' },
      { slug: 'backlog', title: 'Backlog', description: 'Revenue still to be earned, and how fast it is burning off.' },
      { slug: 'cashflow', title: 'Company cash flow', description: 'Collections against outflow by month across every project.' },
    ],
  },
  {
    group: 'Commitments and changes',
    items: [
      { slug: 'subcontractors', title: 'Subcontractor payments', description: 'Every sub: contract value, invoiced, paid, retention and outstanding, across all projects.' },
      { slug: 'change-orders', title: 'Change orders', description: 'Approved, pending and rejected changes with margin and days pending, across all projects.' },
      { slug: 'buyout', title: 'Buyout', description: 'Budget against award on every package, with savings to date.' },
    ],
  },
  {
    group: 'Estimating and pipeline',
    items: [
      { slug: 'bid-summary', title: 'Bid summaries', description: 'Every estimate with direct cost, markup chain and final bid.' },
      { slug: 'pipeline', title: 'Pipeline and win rate', description: 'Opportunity value by stage, source and estimator, with conversion history.' },
    ],
  },
]

export default async function ReportsPage() {
  const user = await requireUser()

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Every report reads the same calculation engine as the dashboards: the numbers cannot disagree"
      />

      <div className="space-y-6">
        {REPORTS.map((group) => {
          // Capability comes from the report spec, the same map the page and both exports read.
          const items = group.items.filter((r) => canOpenReport(user.role, r.slug))
          if (items.length === 0) return null
          return (
            <Section key={group.group} title={group.group}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {items.map((report) => (
                  <Link key={report.slug} href={`/reports/${report.slug}`} className="card block p-4 transition-shadow hover:shadow-[var(--shadow-raised)]">
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      {report.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                      {report.description}
                    </p>
                  </Link>
                ))}
              </div>
            </Section>
          )
        })}
      </div>
    </>
  )
}
