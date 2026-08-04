'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { CATEGORY_LABELS, COST_CATEGORIES } from '@/lib/finance/cost'

export interface BudgetLineOption {
  budgetLineId: string
  description: string
  category: string
  tradeId: string | null
  originalBudget: number
  removable: boolean
}

/**
 * Adding and editing budget lines.
 *
 * A line is a cost type and a description, which is all anyone needs to enter.
 * The remove control appears only for lines with nothing booked against them;
 * everything else is revised rather than deleted, so the history stays whole.
 */
export function BudgetLineForm({
  projectId,
  lines,
  trades,
  add,
  update,
  remove,
  canDelete,
}: {
  projectId: string
  lines: BudgetLineOption[]
  trades: { id: string; label: string }[]
  add: (formData: FormData) => Promise<{ error?: string }>
  update: (formData: FormData) => Promise<{ error?: string }>
  remove: (formData: FormData) => Promise<{ error?: string }>
  canDelete: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  const editingLine = editing ? lines.find((l) => l.budgetLineId === editing) : null

  async function run(action: (fd: FormData) => Promise<{ error?: string }>, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  return (
    <div className="card p-4">
      <form
        key={editingLine?.budgetLineId ?? 'new'}
        action={async (formData) => {
          const ok = await run(editingLine ? update : add, formData)
          if (ok) setEditing(null)
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="projectId" value={projectId} />
        {editingLine && <input type="hidden" name="budgetLineId" value={editingLine.budgetLineId} />}

        <div>
          <label htmlFor="bl-category" className="label mb-1.5 block">
            Cost type
          </label>
          <select id="bl-category" name="category" required defaultValue={editingLine?.category ?? 'SUBCONTRACT'} className="field w-44">
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[16rem] flex-1">
          <label htmlFor="bl-description" className="label mb-1.5 block">
            Description
          </label>
          <input
            id="bl-description"
            name="description"
            required
            defaultValue={editingLine?.description ?? ''}
            placeholder="Foundations subcontract"
            className="field"
          />
        </div>

        <div>
          <label htmlFor="bl-trade" className="label mb-1.5 block">
            Trade
          </label>
          <select id="bl-trade" name="tradeId" defaultValue={editingLine?.tradeId ?? ''} className="field w-44">
            <option value="">Not assigned</option>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {!editingLine && (
          <div>
            <label htmlFor="bl-amount" className="label mb-1.5 block">
              Original budget
            </label>
            <input id="bl-amount" name="originalBudget" type="number" min="0" step="0.01" defaultValue={0} className="field tnum w-40" />
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving' : editingLine ? 'Save line' : 'Add to budget'}
        </button>
        {editingLine && (
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>
            Cancel
          </button>
        )}
      </form>

      {editingLine && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          Amounts are not changed here. Move money with a revision or a transfer so the budget history stays continuous.
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

      {lines.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <p className="label mb-2">Edit a line</p>
          <div className="flex flex-wrap gap-1.5">
            {lines.map((line) => (
              <span
                key={line.budgetLineId}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <button
                  type="button"
                  className="hover:underline"
                  style={{ color: 'var(--accent)' }}
                  onClick={() => setEditing(line.budgetLineId)}
                >
                  {line.description}
                </button>
                <span style={{ color: 'var(--text-subtle)' }}>
                  {CATEGORY_LABELS[line.category as keyof typeof CATEGORY_LABELS] ?? line.category}
                </span>
                {canDelete && line.removable && (
                  <ConfirmButton
                    label="Remove"
                    confirmLabel="Remove line"
                    title={`Remove ${line.description}`}
                    description="Nothing has been booked against this line, so removing it changes no reported figure. The removal is recorded permanently in the audit history."
                    onConfirm={async () => {
                      const formData = new FormData()
                      formData.set('projectId', projectId)
                      formData.set('budgetLineId', line.budgetLineId)
                      await run(remove, formData)
                    }}
                  />
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
