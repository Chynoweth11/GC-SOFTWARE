'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save item'}
    </button>
  )
}

export function GcForm({
  estimateId,
  durationWeeks,
  items,
  action,
}: {
  estimateId: string
  durationWeeks: number
  items: { id: string; label: string }[]
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
      <input type="hidden" name="estimateId" value={estimateId} />

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
          Saved. The bid summary has already repriced.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="gc-existing" className="label mb-1.5 block">
            Update an existing item
          </label>
          <select id="gc-existing" name="itemId" className="field text-xs">
            <option value="">Add a new item</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="gc-item" className="label mb-1.5 block">
            Item
          </label>
          <input id="gc-item" name="item" required className="field text-xs" placeholder="Superintendent" />
        </div>
        <div>
          <label htmlFor="gc-basis" className="label mb-1.5 block">
            Basis
          </label>
          <select id="gc-basis" name="basis" className="field text-xs" defaultValue="WK">
            <option value="WK">Weekly</option>
            <option value="MO">Monthly</option>
            <option value="LS">Lump sum</option>
            <option value="EA">Each</option>
            <option value="DAY">Daily</option>
          </select>
        </div>
        <div>
          <label htmlFor="gc-unit" className="label mb-1.5 block">
            Unit cost
          </label>
          <input id="gc-unit" name="unitCost" type="number" step="0.01" min="0" required className="field text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label htmlFor="gc-qty" className="label mb-1.5 block">
            Quantity
          </label>
          <input id="gc-qty" name="qty" type="number" step="0.01" min="0" className="field text-xs" defaultValue={durationWeeks} />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <input type="checkbox" name="followsDuration" defaultChecked />
            Quantity follows the {durationWeeks}-week duration
          </label>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="gc-notes" className="label mb-1.5 block">
            Notes
          </label>
          <input id="gc-notes" name="notes" className="field text-xs" placeholder="Full-time, part-time allocation, etc." />
        </div>
      </div>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  )
}
