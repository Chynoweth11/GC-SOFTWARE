import { notFound, forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { date, moneyShort, percent } from '@/lib/format'
import { ExportMenu, PageHeader, Pill, StatusPill } from '@/components/ui'
import { EstimateTabs } from '@/components/estimating/estimate-tabs'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  return { title: bundle ? bundle.estimate.name : 'Estimate' }
}

export default async function EstimateLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const user = await requireUser()
  if (!can(user.role, 'view:estimates')) forbidden()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) notFound()

  const { estimate, summary } = bundle

  return (
    <>
      <PageHeader
        title={estimate.name}
        subtitle={
          <>
            {estimate.clientName ?? 'No client'} · {estimate.address ?? 'Location not set'} · {estimate.estimator ?? 'Unassigned'}
          </>
        }
        meta={
          <>
            <StatusPill status={estimate.status} />
            <Pill tone="neutral">Version {estimate.version}</Pill>
            {estimate.bidDueDate && <Pill tone="neutral">Due {date(estimate.bidDueDate)}</Pill>}
            <Pill tone="accent">Bid {moneyShort(summary.buildUp.roundedBid)}</Pill>
            <Pill tone={summary.buildUp.grossMarginOnBid < 0.1 ? 'caution' : 'favorable'}>
              {percent(summary.buildUp.grossMarginOnBid)} margin
            </Pill>
            {summary.qa.issues.length > 0 ? (
              <Pill tone="caution" dot>
                {summary.qa.issues.length} QA issue{summary.qa.issues.length === 1 ? '' : 's'}
              </Pill>
            ) : (
              <Pill tone="favorable" dot>
                QA clear
              </Pill>
            )}
            {estimate.lockedAt && <Pill tone="neutral">Locked {date(estimate.lockedAt)}</Pill>}
          </>
        }
        actions={
          <ExportMenu excelHref={`/api/export/estimate/${estimate.id}`} pdfHref={`/api/pdf/estimate/${estimate.id}`} label="Export estimate" />
        }
      />

      <EstimateTabs estimateId={estimate.id} qaIssues={summary.qa.issues.length} />

      {children}
    </>
  )
}
