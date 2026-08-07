import Link from 'next/link'
import { forbidden, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getDocumentHistory, getProjectDocument } from '@/lib/queries/documents'
import { getLaborClassifications } from '@/lib/queries/labor'
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_LABELS } from '@/lib/finance'
import { date, money, percent, titleize } from '@/lib/format'
import { DataList, InfoNote, Kpi, KpiGrid, MoneyKpi, Pill, Section, StatusPill } from '@/components/ui'
import { ApprovalCheckbox } from '@/components/project/approval-checkbox'
import { DocumentLines } from '@/components/project/document-lines'
import { DocumentAttachments, DocumentSignatures } from '@/components/project/document-signatures'
import { DeleteDocumentButton, DocumentEditor } from '@/components/project/document-editor'
import {
  approvalCertificationText,
  approveDocument,
  deleteAttachment,
  deleteDocument,
  deleteDocumentLine,
  deleteSignature,
  saveAttachment,
  saveDocument,
  saveDocumentLine,
  saveSignature,
  unapproveDocument,
} from '../actions'

export async function generateMetadata({ params }: { params: Promise<{ documentId: string }> }) {
  const user = await requireUser()
  const { documentId } = await params
  const document = await getProjectDocument(documentId, user.companyId)
  return { title: document ? `${document.number} ${document.description}` : 'Document' }
}

/**
 * One contract document, in full.
 *
 * The summarised amount on the project pages opens this: every line, every
 * quantity, every rate, every step of the markup chain, who has signed, what is
 * attached, and the whole history of what was changed and by whom. Nothing on
 * this page is a stored total; it is all worked out from the entered boxes on
 * the way here.
 */
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>
}) {
  const user = await requireUser()
  if (!can(user.role, 'view:project_financials')) forbidden()

  const { id, documentId } = await params
  const document = await getProjectDocument(documentId, user.companyId)
  if (!document || document.projectId !== id) notFound()

  const [history, costCodes, trades, classifications, certification] = await Promise.all([
    getDocumentHistory(documentId, user.companyId),
    prisma.costCode.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, code: true, description: true, category: true },
      orderBy: { code: 'asc' },
    }),
    prisma.trade.findMany({
      where: { companyId: user.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: 'asc' },
    }),
    getLaborClassifications(user.companyId),
    approvalCertificationText(),
  ])

  const canEdit = can(user.role, 'edit:change_orders')
  const canUnapprove = can(user.role, 'unapprove:contract_documents')
  const showMargins = can(user.role, 'view:margins')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/projects/${id}/changes`} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
            Back to every document
          </Link>
          <h1 className="mt-1 text-lg font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
            {document.number}: {document.description}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pill tone="neutral">{DOCUMENT_KIND_LABELS[document.documentKind] ?? document.documentKind}</Pill>
            <StatusPill
              status={document.status}
              label={DOCUMENT_STATUS_LABELS[document.status] ?? document.status}
            />
            <Pill tone={document.isOfficial ? 'favorable' : 'caution'} dot>
              {document.isOfficial ? 'In the contract value' : 'Not in any figure yet'}
            </Pill>
            {document.counterparty && <Pill tone="neutral">With {document.counterparty}</Pill>}
            {document.supersededByNumber && <Pill tone="caution">Superseded by {document.supersededByNumber}</Pill>}
          </div>
        </div>

        <div className="rounded-lg border p-3 no-print" style={{ borderColor: 'var(--border-strong)' }}>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Approval
          </div>
          <div className="mt-1">
            <ApprovalCheckbox
              documentId={document.id}
              documentNumber={document.number}
              amount={document.ownerAmount}
              approved={document.isOfficial}
              approvedAt={document.approvedAt ? date(document.approvedAt) : null}
              approvedByName={document.approvedByName}
              certification={certification}
              canApprove={document.canApprove}
              canUnapprove={canUnapprove}
              blockedReason={document.approvalBlockedReason}
              approve={approveDocument}
              unapprove={unapproveDocument}
            />
          </div>
          {!document.isOfficial && document.approvalBlockedReason && (
            <p className="mt-1 max-w-xs text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {document.approvalBlockedReason}
            </p>
          )}
        </div>
      </div>

      <KpiGrid cols={4}>
        <MoneyKpi
          label="Amount"
          amount={document.ownerAmount}
          detail={document.amountBasis === 'lines' ? 'Priced from the lines below' : 'Entered as a lump sum'}
        />
        <MoneyKpi label="Cost" amount={document.costAmount} detail={`${document.lines.length} priced lines`} />
        {showMargins && (
          <MoneyKpi
            label="Margin"
            amount={document.margin}
            tone={document.margin < 0 ? 'adverse' : 'favorable'}
            detail={percent(document.marginPct)}
          />
        )}
        <Kpi
          label="Signatures"
          value={
            document.signatureCount === 0
              ? 'None recorded'
              : `${document.signedCount} of ${document.signatureCount}`
          }
          tone={
            document.signatureCount > 0 && document.signedCount === document.signatureCount ? 'favorable' : 'caution'
          }
          detail={document.isOfficial ? `Approved ${date(document.approvedAt)}` : 'Not approved'}
        />
      </KpiGrid>

      {document.isOfficial && (
        <InfoNote>
          Approved {date(document.approvedAt)}
          {document.approvedByName ? ` by ${document.approvedByName}` : ''}. {money(document.ownerAmount)} is in this
          project&apos;s contract value and {money(document.costAmount)} of cost is in its budget.
          {document.approvalCertification ? ` Certified: ${document.approvalCertification}` : ''}
        </InfoNote>
      )}

      {document.unapprovedReason && !document.isOfficial && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
        >
          An approval was withdrawn from this document. Reason given: {document.unapprovedReason}
        </div>
      )}

      {document.issues.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)' }}
        >
          <ul className="space-y-0.5 text-xs" style={{ color: 'var(--caution)' }}>
            {document.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      <Section
        title="Priced breakdown"
        description="Scope, quantity, labor, material, equipment, subcontract and everything else, priced the way a takeoff is priced"
      >
        <DocumentLines
          documentId={document.id}
          canEdit={canEdit}
          locked={document.isOfficial}
          save={saveDocumentLine}
          remove={deleteDocumentLine}
          costCodes={costCodes.map((code) => ({
            id: code.id,
            label: `${code.code} ${code.description}`,
            category: code.category,
          }))}
          laborClasses={classifications.map((entry) => ({ name: entry.name, rate: entry.loadedHourlyCost }))}
          rows={document.lineRecords.map((line, index) => {
            const derived = document.lines[index]
            return {
              ...line,
              derived: {
                netQty: derived.netQty,
                grossQty: derived.grossQty,
                laborRate: derived.laborRate,
                laborRateSource: derived.laborRateSource,
                laborHours: derived.laborHours,
                laborCost: derived.laborCost,
                materialCost: derived.materialCost,
                equipmentCost: derived.equipmentCost,
                subCost: derived.subCost,
                otherCost: derived.otherCost,
                totalCost: derived.totalCost,
                unitCost: derived.unitCost,
                qaFlags: derived.qaFlags,
              },
            }
          })}
        />
      </Section>

      {document.buildUp && (
        <Section
          title="How the amount was built"
          description="The same chain, in the same order, as the bid summary"
        >
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Applied to</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                    <th className="num">Running total</th>
                  </tr>
                </thead>
                <tbody>
                  {document.buildUp.steps.map((step, index) => (
                    <tr key={`${step.label}-${index}`} style={{ fontWeight: step.isSubtotal ? 600 : undefined }}>
                      <td>{step.label}</td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {step.basis}
                      </td>
                      <td className="num">{step.rate === null ? '' : percent(step.rate, 3)}</td>
                      <td className="num">{money(step.amount)}</td>
                      <td className="num">{money(step.runningTotal)}</td>
                    </tr>
                  ))}
                  {document.buildUp.roundedBid !== document.buildUp.totalBid && (
                    <tr style={{ fontWeight: 600 }}>
                      <td>Rounded</td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        To the nearest {money(document.markups.roundToNearest)}
                      </td>
                      <td className="num" />
                      <td className="num">{money(document.buildUp.roundedBid - document.buildUp.totalBid)}</td>
                      <td className="num">{money(document.buildUp.roundedBid)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Signatures" description="Everybody who has to sign, and whether they have">
          <DocumentSignatures
            documentId={document.id}
            canEdit={canEdit}
            locked={document.isOfficial}
            save={saveSignature}
            remove={deleteSignature}
            rows={document.signatureRows.map((signature) => ({
              id: signature.id,
              party: signature.party,
              role: signature.role,
              email: signature.email,
              status: signature.status,
              signedAt: signature.signedAt ? signature.signedAt.toISOString() : null,
              note: signature.note,
            }))}
          />
        </Section>

        <Section title="Attached records" description="The signed copy, pricing backup, quotes">
          <DocumentAttachments
            documentId={document.id}
            canEdit={canEdit}
            save={saveAttachment}
            remove={deleteAttachment}
            rows={document.attachments.map((attachment) => ({
              id: attachment.id,
              kind: attachment.kind,
              fileName: attachment.fileName,
              location: attachment.location,
              note: attachment.note,
              uploadedByName: attachment.uploadedByName,
              createdAt: attachment.createdAt.toISOString(),
            }))}
          />
        </Section>
      </div>

      <Section title="The document itself">
        <div className="card p-4">
          <DataList
            columns={3}
            items={[
              { label: 'Number', value: document.number },
              { label: 'Kind', value: DOCUMENT_KIND_LABELS[document.documentKind] ?? document.documentKind },
              { label: 'Why it arose', value: titleize(document.type) },
              { label: 'Status', value: DOCUMENT_STATUS_LABELS[document.status] ?? document.status },
              { label: 'With', value: document.counterparty ?? 'Not recorded' },
              { label: 'Signature reference', value: document.reference ?? 'Not recorded' },
              { label: 'Origin', value: document.origin ?? 'Not recorded' },
              { label: 'Trade', value: document.tradeName ?? 'Not set' },
              { label: 'Initiated', value: date(document.dateInitiated) },
              { label: 'Submitted', value: date(document.dateSubmitted) },
              { label: 'Sent for signature', value: date(document.sentForSignatureAt) },
              { label: 'Fully signed', value: date(document.fullySignedAt) },
              { label: 'Expected approval', value: date(document.anticipatedApproval) },
              { label: 'Probability', value: percent(document.probabilityPct, 0) },
              { label: 'Schedule impact', value: `${document.scheduleImpactDays} days` },
              { label: 'Posts to the budget', value: document.postsToBudget ? 'Yes' : 'No' },
            ]}
          />
          {document.notes && (
            <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              {document.notes}
            </p>
          )}
        </div>

        {canEdit && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <DocumentEditor
              projectId={id}
              save={saveDocument}
              trades={trades.map((trade) => ({ id: trade.id, label: trade.name }))}
              defaults={{
                id: document.id,
                number: document.number,
                documentKind: document.documentKind,
                type: document.type,
                status: document.status,
                description: document.description,
                origin: document.origin,
                counterparty: document.counterparty,
                reference: document.reference,
                tradeId: document.tradeId,
                dateInitiated: document.dateInitiated ? document.dateInitiated.toISOString().slice(0, 10) : null,
                dateSubmitted: document.dateSubmitted ? document.dateSubmitted.toISOString().slice(0, 10) : null,
                anticipatedApproval: document.anticipatedApproval
                  ? document.anticipatedApproval.toISOString().slice(0, 10)
                  : null,
                priceFromLines: document.priceFromLines,
                enteredOwnerAmount: document.enteredOwnerAmount,
                enteredCostAmount: document.enteredCostAmount,
                laborBurdenPct: document.markups.laborBurdenPct,
                salesTaxPct: document.markups.salesTaxPct,
                smallToolsPct: document.markups.smallToolsPct,
                contingencyPct: document.markups.contingencyPct,
                overheadPct: document.markups.overheadPct,
                profitPct: document.markups.profitPct,
                glInsurancePct: document.markups.glInsurancePct,
                bondPct: document.markups.bondPct,
                exciseTaxPct: document.markups.exciseTaxPct,
                roundToNearest: document.markups.roundToNearest,
                probabilityPct: document.probabilityPct,
                scheduleImpactDays: document.scheduleImpactDays,
                postsToBudget: document.postsToBudget,
                notes: document.notes,
                locked: document.isOfficial,
              }}
            />
            <DeleteDocumentButton
              projectId={id}
              documentId={document.id}
              documentNumber={document.number}
              approved={document.isOfficial}
              remove={deleteDocument}
            />
          </div>
        )}
      </Section>

      <Section
        title="History"
        description="Everything that has happened to this document, permanent and not editable by anybody"
      >
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Field</th>
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id}>
                    <td>{date(entry.createdAt)}</td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {entry.userName ?? 'Not recorded'}
                    </td>
                    <td className="wrap">
                      <Pill
                        tone={
                          entry.action === 'APPROVE'
                            ? 'favorable'
                            : entry.action === 'DELETE' || entry.action === 'UNLOCK'
                              ? 'adverse'
                              : 'neutral'
                        }
                      >
                        {titleize(entry.action)}
                      </Pill>
                      {entry.summary && (
                        <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {entry.summary}
                        </div>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {entry.field ?? ''}
                    </td>
                    <td className="wrap text-xs" style={{ color: 'var(--text-subtle)' }}>
                      {entry.oldValue ?? ''}
                    </td>
                    <td className="wrap text-xs" style={{ color: 'var(--text-subtle)' }}>
                      {entry.newValue ?? ''}
                    </td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ color: 'var(--text-subtle)' }}>
                      Nothing recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
