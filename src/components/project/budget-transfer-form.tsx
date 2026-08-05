'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Posting...' : 'Post transfer'}
    </button>
  )
}

export function BudgetTransferForm({
  lines,
  action,
  projectId,
}: {
  lines: { id: string; label: string }[]
  action: (formData: FormData) => Promise<{ error?: string }>
  projectId: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)

  return (
    <form
      action={async (formData) => {
        setError(null)
        setConfirmation(null)
        const result = await action(formData)
        if (result?.error) setError(result.error)
        else setConfirmation('Transfer posted. Both line items now show the movement in their revision history.')
      }}
      className="card space-y-3 p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}
      {confirmation && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 40%, transparent)', color: 'var(--favorable)' }}
          role="status"
        >
          {confirmation}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label htmlFor="fromLineId" className="label mb-1.5 block">
            Transfer from
          </label>
          <select id="fromLineId" name="fromLineId" required className="field text-xs">
            <option value="">Select a line item</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="toLineId" className="label mb-1.5 block">
            Transfer to
          </label>
          <select id="toLineId" name="toLineId" required className="field text-xs">
            <option value="">Select a line item</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="transfer-amount" className="label mb-1.5 block">
            Amount
          </label>
          <input id="transfer-amount" name="amount" type="number" step="0.01" min="0.01" required className="field text-xs" placeholder="0.00" />
        </div>

        <div>
          <label htmlFor="transfer-reason" className="label mb-1.5 block">
            Reason
          </label>
          <input id="transfer-reason" name="reason" required className="field text-xs" placeholder="Why budget is moving" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          Transfers never change the original budget. Both sides are written as linked revisions and stay in the audit trail permanently.
        </p>
        <Submit />
      </div>
    </form>
  )
}
