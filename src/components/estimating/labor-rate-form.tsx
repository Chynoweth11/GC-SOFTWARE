'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving...' : 'Save rate'}
    </button>
  )
}

export function LaborRateForm({
  estimateId,
  action,
  existing,
}: {
  estimateId: string
  action: (formData: FormData) => Promise<{ error?: string }>
  existing: string[]
}) {
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={async (formData) => {
        setError(null)
        const result = await action(formData)
        if (result?.error) setError(result.error)
      }}
      className="card flex flex-wrap items-end gap-3 p-4"
    >
      <input type="hidden" name="estimateId" value={estimateId} />

      {error && (
        <div className="w-full rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="lr-class" className="label mb-1.5 block">
          Labor class
        </label>
        <input id="lr-class" name="className" required list="labor-classes" className="field w-48 text-xs" placeholder="Carpenter" />
        <datalist id="labor-classes">
          {existing.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label htmlFor="lr-rate" className="label mb-1.5 block">
          Bare hourly rate
        </label>
        <input id="lr-rate" name="rate" type="number" step="0.01" min="0" required className="field w-36 text-xs" />
      </div>
      <Submit />
      <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
        Saving an existing class updates its rate and reprices every takeoff line that uses it.
      </p>
    </form>
  )
}
