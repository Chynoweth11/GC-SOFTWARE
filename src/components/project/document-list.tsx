'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApprovalCheckbox } from './approval-checkbox'
import { EmptyState, Pill, StatusPill } from '@/components/ui'
import { date, money, percent } from '@/lib/format'

/**
 * Every contract document on the job, with the one column that matters.
 *
 * A document's amount is shown whatever its state, because knowing what has
 * been asked for is the point of raising it. What separates the money from the
 * exposure is the approval column, and it is the same checkbox on every row so
 * there is one place to look and one act to take.
 *
 * Rows that count are marked plainly, and rows that do not are dimmed rather
 * than hidden: a change order nobody has chased for six weeks is a fact about
 * the job, and hiding it would be the opposite of useful.
 */

export interface DocumentRow {
  id: string
  number: string
  documentKind: string
  kindLabel: string
  type: string
  status: string
  statusLabel: string
  description: string
  counterparty: string | null
  tradeName: string | null
  ownerAmount: number
  costAmount: number
  margin: number
  marginPct: number
  probabilityPct: number
  daysPending: number
  dateInitiated: string | null
  approvedAt: string | null
  approvedByName: string | null
  isOfficial: boolean
  isPending: boolean
  isDead: boolean
  canApprove: boolean
  approvalBlockedReason: string | null
  signedCount: number
  signatureCount: number
  lineCount: number
  attachmentCount: number
  signedDocumentCount: number
  amountBasis: string
  issues: string[]
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const STATE_FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'approved', label: 'Approved and signed' },
  { id: 'pending', label: 'Pending approval' },
  { id: 'dead', label: 'Rejected or cancelled' },
] as const

export function DocumentList({
  projectId,
  rows,
  showMargins,
  canUnapprove,
  certification,
  approve,
  unapprove,
}: {
  projectId: string
  rows: DocumentRow[]
  showMargins: boolean
  canUnapprove: boolean
  certification: string
  approve: Action
  unapprove: Action
}) {
  const router = useRouter()
  const [state, setState] = useState<(typeof STATE_FILTERS)[number]['id']>('all')
  const [kind, setKind] = useState('all')

  const kinds = useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of rows) seen.set(row.documentKind, row.kindLabel)
    return [...seen.entries()]
  }, [rows])

  const shown = rows.filter((row) => {
    if (kind !== 'all' && row.documentKind !== kind) return false
    if (state === 'approved') return row.isOfficial
    if (state === 'pending') return row.isPending
    if (state === 'dead') return row.isDead
    return true
  })

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="§"
        title="No contract documents on this job yet"
        description="Change orders, the prime contract, amendments and addendums all live here. Each one is priced line by line like a takeoff, sent for signature, and only reaches the contract value once somebody certifies that it is signed."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <select
          value={state}
          onChange={(event) => setState(event.target.value as typeof state)}
          className="field h-8 text-xs"
          aria-label="Filter by where it stands"
        >
          {STATE_FILTERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {kinds.length > 1 && (
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="field h-8 text-xs"
            aria-label="Filter by kind of document"
          >
            <option value="all">Every kind</option>
            {kinds.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          {shown.length} of {rows.length}
        </span>
      </div>

      <div className="card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Number</th>
                <th>Description</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Signatures</th>
                <th className="num">Amount</th>
                <th className="num">Cost</th>
                {showMargins && <th className="num">Margin</th>}
                <th className="num">Days open</th>
                <th>In the contract value</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} style={{ opacity: row.isDead ? 0.55 : 1 }}>
                  <td>
                    <Link
                      href={`/projects/${projectId}/changes/${row.id}`}
                      className="font-medium hover:underline"
                      style={{ color: 'var(--accent)' }}
                    >
                      {row.number}
                    </Link>
                  </td>
                  <td className="wrap">
                    {row.description}
                    <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                      {row.lineCount > 0 ? `${row.lineCount} priced lines` : 'No priced lines'}
                      {row.counterparty ? ` · ${row.counterparty}` : ''}
                      {row.tradeName ? ` · ${row.tradeName}` : ''}
                      {row.attachmentCount > 0 ? ` · ${row.attachmentCount} attached` : ''}
                    </div>
                  </td>
                  <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {row.kindLabel}
                  </td>
                  <td>
                    <StatusPill status={row.status} label={row.statusLabel} />
                  </td>
                  <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {row.signatureCount === 0 ? (
                      <span style={{ color: 'var(--text-subtle)' }}>None recorded</span>
                    ) : (
                      `${row.signedCount} of ${row.signatureCount} signed`
                    )}
                  </td>
                  <td className="num font-medium">{money(row.ownerAmount)}</td>
                  <td className="num">{money(row.costAmount)}</td>
                  {showMargins && (
                    <td className="num" style={{ color: row.margin < 0 ? 'var(--adverse)' : undefined }}>
                      {money(row.margin)}
                      <span className="ml-1 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                        {percent(row.marginPct, 0)}
                      </span>
                    </td>
                  )}
                  <td
                    className="num"
                    style={{ color: row.isPending && row.daysPending > 30 ? 'var(--caution)' : undefined }}
                  >
                    {row.isDead ? '-' : row.daysPending}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <ApprovalCheckbox
                        documentId={row.id}
                        documentNumber={row.number}
                        amount={row.ownerAmount}
                        approved={row.isOfficial}
                        approvedAt={row.approvedAt ? date(row.approvedAt) : null}
                        approvedByName={row.approvedByName}
                        certification={certification}
                        canApprove={row.canApprove}
                        canUnapprove={canUnapprove}
                        blockedReason={row.approvalBlockedReason}
                        approve={approve}
                        unapprove={unapprove}
                      />
                      {row.isOfficial && row.signedDocumentCount === 0 && (
                        <Pill tone="caution">No signed copy attached</Pill>
                      )}
                      {!row.isOfficial && row.approvalBlockedReason && !row.isDead && (
                        <span className="wrap text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                          {row.approvalBlockedReason}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={showMargins ? 10 : 9} style={{ color: 'var(--text-subtle)' }}>
                    Nothing matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs no-print" style={{ color: 'var(--text-subtle)' }}>
        Click a number to open the full breakdown: every line, quantity, rate, markup step, signature, attachment and
        the whole history of what was changed and by whom.
      </p>
      <button type="button" className="sr-only" onClick={() => router.refresh()}>
        Refresh
      </button>
    </div>
  )
}
