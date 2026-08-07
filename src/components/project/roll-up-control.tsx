'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { money } from '@/lib/format'

/**
 * Which change order a time and materials ticket is billed under.
 *
 * A ticket is signed on the day for hours and machines that were really there.
 * It becomes money either on its own, where the owner is billed directly, or
 * through a change order that rolls several tickets together. Both counting
 * would bill the same work twice, so naming a parent here takes the ticket out
 * of the contract value and leaves the change order carrying it.
 */
export function RollUpControl({
  documentId,
  documentNumber,
  amount,
  rollsUpToId,
  rollsUpToNumber,
  candidates,
  canEdit,
  locked,
  save,
}: {
  documentId: string
  documentNumber: string
  amount: number
  rollsUpToId: string | null
  rollsUpToNumber: string | null
  candidates: { id: string; label: string }[]
  canEdit: boolean
  locked: boolean
  save: (formData: FormData) => Promise<{ error?: string }>
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!canEdit) {
    return (
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {rollsUpToNumber
          ? `Billed under ${rollsUpToNumber}, so this ticket adds nothing on its own.`
          : 'Billed on its own.'}
      </p>
    )
  }

  return (
    <form
      action={async (formData) => {
        setBusy(true)
        setError(null)
        const result = await save(formData)
        setBusy(false)
        if (result?.error) {
          setError(result.error)
          return
        }
        router.refresh()
      }}
      className="space-y-2"
    >
      <input type="hidden" name="id" value={documentId} />

      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Billed under
        </span>
        <select
          name="rollsUpToId"
          defaultValue={rollsUpToId ?? ''}
          disabled={locked}
          className="field mt-1 w-full text-sm"
        >
          <option value="">Billed on its own</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </label>

      <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
        {rollsUpToNumber
          ? `${money(amount)} on ${documentNumber} is carried by ${rollsUpToNumber}, so this ticket adds nothing to the contract value on its own.`
          : `${money(amount)} on ${documentNumber} counts on its own once it is approved. Name a change order here if that change order will bill this work instead.`}
      </p>

      {!locked && (
        <button type="submit" className="btn btn-ghost text-xs" disabled={busy}>
          Save where it bills
        </button>
      )}
      {locked && (
        <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          This ticket is approved, so where it bills is locked. Withdraw the approval to change it.
        </p>
      )}
    </form>
  )
}
