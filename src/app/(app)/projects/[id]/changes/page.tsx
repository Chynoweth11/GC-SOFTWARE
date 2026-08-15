import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { getProjectDocuments } from '@/lib/queries/documents'
import { prisma } from '@/lib/db'
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_LABELS, timeAndMaterialsSummary } from '@/lib/finance'
import { hours, money, moneyShort, percent } from '@/lib/format'
import { InfoNote, Kpi, KpiGrid, MoneyKpi, Section } from '@/components/ui'
import { ChartFrame, DonutChart, HorizontalBars } from '@/components/charts/primitives'
import { DocumentList } from '@/components/project/document-list'
import { NewDocumentPanel } from '@/components/project/new-document-panel'
import { approvalCertificationText, approveDocument, saveDocument, unapproveDocument } from './actions'

export const metadata = { title: 'Change orders and contracts' }

/**
 * Change orders, contracts, amendments and addendums for one project.
 *
 * The four totals at the top are the point of the page. Only one of them is
 * money: what has been approved and signed. The others say what has been asked
 * for, what is at stake and what was refused, and they are shown side by side
 * so nobody can read one as another.
 */
export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params

  const [bundle, documents, trades, certification] = await Promise.all([
    getProjectBundle(id, user.companyId),
    getProjectDocuments(id, user.companyId),
    prisma.trade.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    approvalCertificationText(),
  ])
  if (!bundle) notFound()

  const { project, financials: f } = bundle
  const canEdit = can(user.role, 'edit:change_orders')
  const canUnapprove = can(user.role, 'unapprove:contract_documents')
  const showMargins = can(user.role, 'view:margins')
  const totals = documents.totals
  const tm = timeAndMaterialsSummary(documents.documents)

  // Value by status, for the shape of what is sitting where.
  const byStatus = new Map<string, number>()
  for (const document of documents.documents) {
    byStatus.set(document.status, (byStatus.get(document.status) ?? 0) + document.ownerAmount)
  }
  const statusRows = [...byStatus.entries()].sort((a, b) => b[1] - a[1])

  const byTrade = new Map<string, number>()
  for (const document of documents.documents) {
    const name = document.tradeName ?? 'Unassigned'
    byTrade.set(name, (byTrade.get(name) ?? 0) + document.ownerAmount)
  }
  const tradeRows = [...byTrade.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-6">
      <Section
        title="What has been raised, and what actually counts"
        description="Only the approved and signed total reaches the contract value, the budget, the forecast, the dashboard and the reports"
      >
        <KpiGrid cols={4}>
          <MoneyKpi
            label="Total entered"
            amount={totals.entered}
            detail={`${totals.enteredCount} documents, whatever their state`}
          />
          <MoneyKpi
            label="Approved and signed"
            amount={totals.approved}
            tone="favorable"
            detail={`${totals.approvedCount} in the contract value`}
          />
          <MoneyKpi
            label="Pending approval"
            amount={totals.pending}
            tone="caution"
            detail={`${totals.pendingCount} entered but not counted`}
          />
          <MoneyKpi
            label="Rejected or cancelled"
            amount={totals.rejected}
            detail={`${totals.rejectedCount} closed out`}
          />
        </KpiGrid>

        <div className="mt-3">
          <KpiGrid cols={4}>
            <MoneyKpi
              label="Weighted pending"
              amount={totals.weightedPending}
              hint="Pending value times each document's probability. Used for forecasting, never for the contract value."
            />
            {showMargins && (
              <MoneyKpi
                label="Margin on approved"
                amount={totals.approvedMargin}
                tone={totals.approvedMargin < 0 ? 'adverse' : 'favorable'}
                detail={percent(totals.approvedMarginPct)}
              />
            )}
            <Kpi
              label="Average days open"
              value={totals.avgDaysPending ? Math.round(totals.avgDaysPending).toString() : '-'}
              tone={totals.avgDaysPending > 30 ? 'caution' : 'neutral'}
              detail={`${totals.scheduleImpactDays} days of approved schedule impact`}
            />
            <Kpi
              label="Original contract from"
              value={documents.original.basis === 'contract documents' ? 'Signed contracts' : 'Project setup'}
              detail={
                documents.original.basis === 'contract documents'
                  ? `${documents.original.documentCount} approved contract documents, ${moneyShort(documents.original.amount)}`
                  : `${moneyShort(documents.original.amount)} entered when the job was opened`
              }
            />
          </KpiGrid>
        </div>
      </Section>

      <InfoNote>
        Original {money(f.contract.originalContract)} plus approved {money(f.contract.approvedChangeOrders)} makes{' '}
        <strong>{money(f.contract.currentContract)}</strong> of current contract. With every pending document approved
        it would reach {money(f.contract.potentialContract)}. Forecasting currently carries{' '}
        {percent(project.pendingCoInclusionPct, 0)} of the weighted pending exposure, and nothing else pending touches
        any figure on this system.
      </InfoNote>

      {tm.count > 0 && (
        <Section
          title="Time and materials"
          description="Signed a day at a time, then either billed on its own or rolled into a change order that carries it"
        >
          <KpiGrid cols={5}>
            <MoneyKpi label="Tickets raised" amount={tm.entered} detail={`${tm.count} tickets`} />
            <MoneyKpi
              label="Billed on their own"
              amount={tm.standalone}
              detail={`${tm.standaloneCount} not rolled up`}
            />
            <MoneyKpi
              label="Rolled into change orders"
              amount={tm.rolledUp}
              detail={`${tm.rolledUpCount} carried elsewhere, counted once`}
            />
            <Kpi
              label="Hours behind them"
              value={`${hours(tm.laborHours)} labor`}
              detail={`${hours(tm.equipmentHours)} machine hours`}
            />
            <MoneyKpi
              label="Nobody has signed"
              amount={tm.unsignedValue}
              tone={tm.unsignedCount > 0 ? 'adverse' : 'favorable'}
              detail={
                tm.unsignedCount > 0
                  ? `${tm.unsignedCount} tickets to chase`
                  : 'Every ticket is signed'
              }
            />
          </KpiGrid>
        </Section>
      )}

      {canEdit && (
        <NewDocumentPanel
          projectId={id}
          save={saveDocument}
          trades={trades.map((trade) => ({ id: trade.id, label: trade.name }))}
        />
      )}

      <Section title="Every document on this job">
        <DocumentList
          projectId={id}
          showMargins={showMargins}
          canUnapprove={canUnapprove}
          certification={certification}
          approve={approveDocument}
          unapprove={unapproveDocument}
          rows={documents.documents.map((document) => ({
            id: document.id,
            number: document.number,
            documentKind: document.documentKind,
            kindLabel: DOCUMENT_KIND_LABELS[document.documentKind] ?? document.documentKind,
            type: document.type,
            status: document.status,
            statusLabel: DOCUMENT_STATUS_LABELS[document.status] ?? document.status,
            description: document.description,
            counterparty: document.counterparty,
            tradeName: document.tradeName,
            ownerAmount: document.ownerAmount,
            costAmount: document.costAmount,
            margin: document.margin,
            marginPct: document.marginPct,
            probabilityPct: document.probabilityPct,
            daysPending: document.daysPending,
            dateInitiated: document.dateInitiated ? document.dateInitiated.toISOString() : null,
            approvedAt: document.approvedAt ? document.approvedAt.toISOString() : null,
            approvedByName: document.approvedByName,
            isOfficial: document.isOfficial,
            isPending: document.isPending,
            isDead: document.isDead,
            isRolledUp: document.isRolledUp,
            rollsUpToNumber: document.rollsUpToNumber,
            canApprove: document.canApprove,
            approvalBlockedReason: document.approvalBlockedReason,
            signedCount: document.signedCount,
            signatureCount: document.signatureCount,
            lineCount: document.lines.length,
            attachmentCount: document.attachmentCount,
            signedDocumentCount: document.signedDocumentCount,
            amountBasis: document.amountBasis,
            issues: document.issues,
          }))}
        />
      </Section>

      {documents.documents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartFrame title="Value by status">
            <DonutChart
              format="moneyShort"
              centerLabel="Total raised"
              centerValue={moneyShort(totals.entered)}
              slices={statusRows.map(([status, value]) => ({
                label: DOCUMENT_STATUS_LABELS[status as keyof typeof DOCUMENT_STATUS_LABELS] ?? status,
                value,
              }))}
            />
          </ChartFrame>

          <ChartFrame
            title="Amount against cost"
            subtitle="The gap is the margin on the change"
            className="lg:col-span-2"
          >
            <HorizontalBars
              labels={documents.documents.map((document) => `${document.number} ${document.description.slice(0, 40)}`)}
              format="moneyShort"
              series={[
                {
                  key: 'owner',
                  label: 'Amount',
                  values: documents.documents.map((document) => document.ownerAmount),
                },
                {
                  key: 'cost',
                  label: 'Cost',
                  values: documents.documents.map((document) => document.costAmount),
                  color: 'var(--caution)',
                },
              ]}
            />
          </ChartFrame>
        </div>
      )}

      {tradeRows.length > 1 && (
        <ChartFrame title="Value by trade">
          <HorizontalBars
            labels={tradeRows.map(([name]) => name)}
            format="moneyShort"
            series={[{ key: 'value', label: 'Amount', values: tradeRows.map(([, value]) => value) }]}
          />
        </ChartFrame>
      )}
    </div>
  )
}
