import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getProjectBundle } from '@/lib/queries/project'
import { date, moneyShort, percent } from '@/lib/format'
import { ExportMenu, PageHeader, Pill, StatusPill } from '@/components/ui'
import { ProjectTabs } from '@/components/project/project-tabs'
import { ProjectSearch } from '@/components/project/project-search'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  return { title: bundle ? `${bundle.project.number} ${bundle.project.name}` : 'Project' }
}

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials, alerts } = bundle
  const criticalCount = alerts.filter((a) => a.severity === 'CRITICAL').length

  return (
    <>
      <PageHeader
        title={`${project.number}: ${project.name}`}
        subtitle={
          <>
            {project.client?.name ?? 'No client on file'} · {[project.city, project.state].filter(Boolean).join(', ') || 'Location not set'} ·{' '}
            {project.pm?.name ?? 'Unassigned'}
          </>
        }
        meta={
          <>
            <StatusPill status={project.status} />
            <StatusPill status={financials.health.flag} />
            <StatusPill status={financials.health.scheduleStatus} />
            <Pill tone="neutral">Data date {date(project.dataDate)}</Pill>
            <Pill tone="neutral">Contract {moneyShort(financials.contract.currentContract)}</Pill>
            <Pill tone={financials.forecastMargin < project.targetMarginPct ? 'caution' : 'favorable'}>
              {percent(financials.forecastMargin)} forecast margin
            </Pill>
            <Pill tone="neutral">{percent(financials.revenue.pctComplete)} complete</Pill>
          </>
        }
        actions={
          <>
            <ProjectSearch projectId={project.id} />
            <ExportMenu
              excelHref={`/api/export/project/${project.id}`}
              pdfHref={`/api/pdf/project/${project.id}`}
              label="Export project"
            />
          </>
        }
      />

      <ProjectTabs projectId={project.id} alertCount={criticalCount} />

      {children}
    </>
  )
}
