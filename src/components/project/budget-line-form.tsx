'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'

export interface BudgetLineOption {
  budgetLineId: string
  code: string
  description: string
  originalBudget: number
  removable: boolean
  blockedBecause: string | null
}

/**
 * Adding a cost code to the budget, and removing one that was never used.
 *
 * The remove control only appears for lines with nothing booked against them.
 * Everything else is revised rather than deleted, so the budget's history stays
 * continuous.
 */
export function BudgetLineForm({
  projectId,
  availableCodes,
  lines,
  add,
  remove,
  canDelete,
}: {
  projectId: string
  availableCodes: { id: string; label: string }[]
  lines: BudgetLineOption[]
  add: (formData: FormData) => Promise<{ error?: string }>
  remove: (formData: FormData) => Promise<{ error?: string }>
  canDelete: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const removable = lines.filter((l) => l.removable)

  return (
    <div className="card p-4">
      <form
        action={async (formData) => {
          setBusy(true)
          setError(null)
          const result = await add(formData)
          setBusy(false)
          if (result?.error) setError(result.error)
          else router.refresh()
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="bl-code" className="label mb-1.5 block">
            Cost code to add
          </label>
          <select id="bl-code" name="costCodeId" required className="field" defaultValue="">
            <option value="" disabled>
              Choose a cost code
            </option>
            {availableCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="bl-amount" className="label mb-1.5 block">
            Original budget
          </label>
          <input id="bl-amount" name="originalBudget" type="number" min="0" step="0.01" defaultValue={0} className="field tnum w-40" />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="bl-notes" className="label mb-1.5 block">
            Note
          </label>
          <input id="bl-notes" name="notes" placeholder="Optional" className="field" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || availableCodes.length === 0}>
          {busy ? 'Adding' : 'Add to budget'}
        </button>
      </form>

      {availableCodes.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-subtle)' }}>
          Every active cost code is already on this budget.
        </p>
      )}

      {error && (
        <div
          className="mt-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {canDelete && removable.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <p className="label mb-2">Lines with nothing booked against them</p>
          <div className="flex flex-wrap gap-2">
            {removable.map((line) => (
              <span
                key={line.budgetLineId}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                {line.code} {line.description}
                <ConfirmButton
                  label="Remove"
                  confirmLabel="Remove line"
                  title={`Remove ${line.code} from the budget`}
                  description="Nothing has been booked against this cost code, so removing it changes no reported figure. The removal is recorded permanently in the audit history."
                  onConfirm={async () => {
                    const formData = new FormData()
                    formData.set('projectId', projectId)
                    formData.set('budgetLineId', line.budgetLineId)
                    const result = await remove(formData)
                    if (result?.error) setError(result.error)
                    else router.refresh()
                  }}
                />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
