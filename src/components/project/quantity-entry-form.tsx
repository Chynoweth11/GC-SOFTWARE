'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Recording...' : 'Record production'}
    </button>
  )
}

export function QuantityEntryForm({
  projectId,
  items,
  action,
}: {
  projectId: string
  items: { id: string; label: string; lastPeriod: string | null }[]
  action: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={async (formData) => {
        setError(null)
        setSaved(false)
        const result = await action(formData)
        if (result?.error) setError(result.error)
        else setSaved(true)
      }}
      className="card space-y-3 p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 40%, transparent)', color: 'var(--favorable)' }}
          role="status"
        >
          Production recorded. Productivity and forecast hours have already recalculated.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="q-item" className="label mb-1.5 block">
            Work item
          </label>
          <select id="q-item" name="itemId" required className="field text-xs">
            <option value="">Select</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q-period" className="label mb-1.5 block">
            Period end
          </label>
          <input id="q-period" name="periodEnd" type="date" required className="field text-xs" />
        </div>
        <div>
          <label htmlFor="q-installed" className="label mb-1.5 block">
            Installed this period
          </label>
          <input id="q-installed" name="installedQty" type="number" step="0.01" min="0" required className="field text-xs" />
        </div>
        <div>
          <label htmlFor="q-hours" className="label mb-1.5 block">
            Actual hours
          </label>
          <input id="q-hours" name="actualHours" type="number" step="0.25" min="0" required className="field text-xs" />
        </div>
        <div>
          <label htmlFor="q-crew" className="label mb-1.5 block">
            Crew days
          </label>
          <input id="q-crew" name="crewDays" type="number" step="0.5" min="0" className="field text-xs" />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="q-notes" className="label mb-1.5 block">
            Notes
          </label>
          <input id="q-notes" name="notes" className="field text-xs" placeholder="Conditions, crew changes, anything affecting the rate" />
        </div>
        <Submit />
      </div>
    </form>
  )
}
