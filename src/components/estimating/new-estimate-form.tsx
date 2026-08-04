'use client'

import { useState } from 'react'

/**
 * Opening a new estimate.
 *
 * Short on purpose. The markup chain, burden and tax rates are inherited from
 * the company defaults and edited on the estimate's setup tab once it exists,
 * so nothing here asks for a percentage.
 */
export function NewEstimateForm({
  estimator,
  create,
}: {
  estimator: string
  create: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <form
      action={async (formData) => {
        setBusy(true)
        setError(null)
        // A successful create redirects, so reaching here means it failed.
        const result = await create(formData)
        setBusy(false)
        if (result?.error) setError(result.error)
      }}
      className="card max-w-3xl p-5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="ne-name" className="label mb-1.5 block">
            Estimate name
          </label>
          <input id="ne-name" name="name" required placeholder="Riverview Office Tenant Improvement" className="field" />
        </div>
        <div>
          <label htmlFor="ne-client" className="label mb-1.5 block">
            Client
          </label>
          <input id="ne-client" name="clientName" placeholder="Riverview Partners LLC" className="field" />
        </div>
        <div>
          <label htmlFor="ne-estimator" className="label mb-1.5 block">
            Estimator
          </label>
          <input id="ne-estimator" name="estimator" defaultValue={estimator} className="field" />
        </div>
        <div>
          <label htmlFor="ne-architect" className="label mb-1.5 block">
            Architect
          </label>
          <input id="ne-architect" name="architect" className="field" />
        </div>
        <div>
          <label htmlFor="ne-type" className="label mb-1.5 block">
            Project type
          </label>
          <input id="ne-type" name="projectType" placeholder="Commercial" className="field" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ne-address" className="label mb-1.5 block">
            Address
          </label>
          <input id="ne-address" name="address" className="field" />
        </div>
        <div>
          <label htmlFor="ne-due" className="label mb-1.5 block">
            Bid due
          </label>
          <input id="ne-due" name="bidDueDate" type="date" className="field" />
        </div>
        <div>
          <label htmlFor="ne-duration" className="label mb-1.5 block">
            Duration in weeks
          </label>
          <input id="ne-duration" name="durationWeeks" type="number" min="0" step="1" defaultValue={0} className="field tnum" />
        </div>
        <div>
          <label htmlFor="ne-area" className="label mb-1.5 block">
            Building area in square feet
          </label>
          <input id="ne-area" name="buildingAreaSf" type="number" min="0" step="1" defaultValue={0} className="field tnum" />
        </div>
      </div>

      {error && (
        <div
          className="mt-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating' : 'Create estimate'}
        </button>
      </div>
    </form>
  )
}
