'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Posting...' : 'Post cost'}
    </button>
  )
}

export function CostEntryForm({
  projectId,
  costCodes,
  vendors,
  commitments,
  action,
}: {
  projectId: string
  costCodes: { id: string; label: string }[]
  vendors: { id: string; label: string }[]
  commitments: { id: string; label: string }[]
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
          Cost posted. Every budget, forecast and dashboard reading this line item has already updated.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <label htmlFor="cost-date" className="label mb-1.5 block">
            Date
          </label>
          <input id="cost-date" name="date" type="date" required className="field text-xs" defaultValue="2026-03-31" />
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="cost-code" className="label mb-1.5 block">
            Line item
          </label>
          <select id="cost-code" name="costCodeId" required className="field text-xs">
            <option value="">Select a line item</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cost-type" className="label mb-1.5 block">
            Type
          </label>
          <select id="cost-type" name="type" className="field text-xs" defaultValue="ACTUAL">
            <option value="ACTUAL">Actual</option>
            <option value="ACCRUAL">Accrual</option>
          </select>
        </div>

        <div>
          <label htmlFor="cost-amount" className="label mb-1.5 block">
            Amount
          </label>
          <input id="cost-amount" name="amount" type="number" step="0.01" required className="field text-xs" placeholder="0.00" />
        </div>

        <div>
          <label htmlFor="cost-hours" className="label mb-1.5 block">
            Hours (labor)
          </label>
          <input id="cost-hours" name="hours" type="number" step="0.25" min="0" className="field text-xs" placeholder="-" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="cost-description" className="label mb-1.5 block">
            Description
          </label>
          <input id="cost-description" name="description" required className="field text-xs" placeholder="What this cost is for" />
        </div>

        <div>
          <label htmlFor="cost-vendor" className="label mb-1.5 block">
            Vendor
          </label>
          <select id="cost-vendor" name="vendorId" className="field text-xs">
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cost-commitment" className="label mb-1.5 block">
            Against commitment
          </label>
          <select id="cost-commitment" name="commitmentId" className="field text-xs">
            <option value="">None</option>
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="cost-reference" className="label mb-1.5 block">
            Reference
          </label>
          <input id="cost-reference" name="reference" className="field text-xs" placeholder="Invoice or journal number" />
        </div>
        <div>
          <label htmlFor="cost-attachment" className="label mb-1.5 block">
            Backup document
          </label>
          <input id="cost-attachment" name="attachmentName" className="field text-xs" placeholder="Invoice file name" />
        </div>
        <div>
          <label htmlFor="cost-notes" className="label mb-1.5 block">
            Notes
          </label>
          <input id="cost-notes" name="notes" className="field text-xs" placeholder="Optional" />
        </div>
      </div>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  )
}
