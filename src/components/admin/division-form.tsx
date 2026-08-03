'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Adding…' : 'Add division'}
    </button>
  )
}

export function DivisionForm({ action }: { action: (formData: FormData) => Promise<{ error?: string }> }) {
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      action={async (formData) => {
        setError(null)
        const result = await action(formData)
        if (result?.error) setError(result.error)
      }}
      className="card mt-3 flex flex-wrap items-end gap-3 p-4"
    >
      {error && (
        <div className="w-full rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="d-code" className="label mb-1.5 block">
          Division code
        </label>
        <input id="d-code" name="code" required className="field w-28 text-xs" placeholder="34" />
      </div>
      <div className="min-w-[16rem] flex-1">
        <label htmlFor="d-name" className="label mb-1.5 block">
          Division name
        </label>
        <input id="d-name" name="name" required className="field text-xs" placeholder="Transportation" />
      </div>
      <Submit />
    </form>
  )
}
