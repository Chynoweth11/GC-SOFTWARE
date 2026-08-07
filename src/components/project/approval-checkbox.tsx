'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { money } from '@/lib/format'

/**
 * The checkbox that lets a document's money into the project.
 *
 * It is a checkbox because that is what people asked for and what the act
 * feels like, but ticking it opens a dialog rather than doing anything. The
 * dialog states the amount, states what is about to change, and asks the person
 * to certify in words that they have seen the signed copy. Nothing happens
 * until they answer yes; answering no leaves the box exactly as it was.
 *
 * Unticking it is a different act with different words and a required reason,
 * because it moves a contract value downwards after people have relied on it.
 */

type Action = (formData: FormData) => Promise<{ error?: string }>

export function ApprovalCheckbox({
  documentId,
  documentNumber,
  amount,
  approved,
  approvedAt,
  approvedByName,
  certification,
  canApprove,
  canUnapprove,
  blockedReason,
  approve,
  unapprove,
  compact = false,
}: {
  documentId: string
  documentNumber: string
  amount: number
  approved: boolean
  approvedAt: string | null
  approvedByName: string | null
  certification: string
  /** The engine's answer: is this document in a state that could be approved. */
  canApprove: boolean
  /** Does this person hold the capability to withdraw one. */
  canUnapprove: boolean
  blockedReason: string | null
  approve: Action
  unapprove: Action
  compact?: boolean
}) {
  const router = useRouter()
  const [asking, setAsking] = useState<null | 'approve' | 'withdraw'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [agreed, setAgreed] = useState(false)

  async function run(action: Action, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setAsking(null)
    setAgreed(false)
    setReason('')
    router.refresh()
  }

  const locked = approved ? !canUnapprove : !canApprove
  const title = approved
    ? canUnapprove
      ? 'Approved. Untick to withdraw the approval.'
      : `Approved${approvedAt ? ` on ${approvedAt}` : ''}. Your role cannot withdraw an approval.`
    : (blockedReason ?? 'Tick to certify that this document is signed and let its amount into the project.')

  return (
    <>
      <label
        className="inline-flex items-center gap-2"
        title={title}
        style={{ cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.55 : 1 }}
      >
        <input
          type="checkbox"
          checked={approved}
          disabled={locked || busy}
          onChange={() => setAsking(approved ? 'withdraw' : 'approve')}
          aria-label={`${approved ? 'Withdraw the approval of' : 'Approve'} ${documentNumber}`}
        />
        {!compact && (
          <span className="text-xs" style={{ color: approved ? 'var(--favorable)' : 'var(--text-muted)' }}>
            {approved ? 'Approved and signed' : 'Not approved'}
          </span>
        )}
      </label>

      {asking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'color-mix(in oklab, black 55%, transparent)' }}
          role="dialog"
          aria-modal="true"
          aria-label={asking === 'approve' ? 'Certify this approval' : 'Withdraw this approval'}
        >
          <div
            className="w-full max-w-xl rounded-xl border p-5"
            style={{ background: 'var(--surface)', borderColor: 'var(--border-strong)' }}
          >
            {asking === 'approve' ? (
              <>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Approve {documentNumber} for {money(amount)}
                </h2>
                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  Approving this adds {money(amount)} to this project&apos;s contract value, posts its cost to the budget,
                  and puts it into the forecast, the dashboard and every financial report. It is recorded permanently
                  against your name.
                </p>

                <label
                  className="mt-3 flex items-start gap-2 rounded-lg border p-3"
                  style={{ borderColor: 'var(--border-strong)', background: 'var(--surface-inset)' }}
                >
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(event) => setAgreed(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-xs" style={{ color: 'var(--text)' }}>
                    {certification}
                  </span>
                </label>

                {error && (
                  <div
                    className="mt-3 rounded-lg border px-3 py-2 text-xs"
                    style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => {
                      setAsking(null)
                      setAgreed(false)
                      setError(null)
                    }}
                  >
                    No, cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary text-xs"
                    disabled={!agreed || busy}
                    onClick={() => {
                      const formData = new FormData()
                      formData.set('id', documentId)
                      formData.set('certified', 'true')
                      void run(approve, formData)
                    }}
                  >
                    Yes, approve it
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--adverse)' }}>
                  Withdraw the approval of {documentNumber}
                </h2>
                <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  This takes {money(amount)} back out of the contract value, reverses the budget revisions it posted,
                  and changes the forecast, the dashboard and every report built on them. It was approved
                  {approvedByName ? ` by ${approvedByName}` : ''}
                  {approvedAt ? ` on ${approvedAt}` : ''}. The withdrawal and your reason go on the permanent record.
                </p>

                <label className="mt-3 block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                    Why is the approval being withdrawn?
                  </span>
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    className="field mt-1 w-full text-xs"
                    placeholder="For example: the signed copy turned out to be an earlier revision."
                  />
                </label>

                {error && (
                  <div
                    className="mt-3 rounded-lg border px-3 py-2 text-xs"
                    style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() => {
                      setAsking(null)
                      setReason('')
                      setError(null)
                    }}
                  >
                    No, leave it approved
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger text-xs"
                    disabled={!reason.trim() || busy}
                    onClick={() => {
                      const formData = new FormData()
                      formData.set('id', documentId)
                      formData.set('confirmed', 'true')
                      formData.set('reason', reason)
                      void run(unapprove, formData)
                    }}
                  >
                    Yes, withdraw it
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
