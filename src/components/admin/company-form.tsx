'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving...' : 'Save company defaults'}
    </button>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function CompanyForm({
  action,
  company,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>
  company: {
    name: string
    legalName: string | null
    address: string | null
    city: string | null
    state: string | null
    phone: string | null
    fiscalYearStartMonth: number
    targetMarginPct: number
    defaultRetentionPct: number
    defaultLaborBurdenPct: number
    defaultOverheadPct: number
  }
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
      className="card space-y-4 p-4"
    >
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
          Saved. The target margin now drives the health scoring on every dashboard.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <div>
          <label htmlFor="c-name" className="label mb-1.5 block">Company name</label>
          <input id="c-name" name="name" required defaultValue={company.name} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="c-legal" className="label mb-1.5 block">Legal name</label>
          <input id="c-legal" name="legalName" defaultValue={company.legalName ?? ''} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="c-address" className="label mb-1.5 block">Address</label>
          <input id="c-address" name="address" defaultValue={company.address ?? ''} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="c-phone" className="label mb-1.5 block">Phone</label>
          <input id="c-phone" name="phone" defaultValue={company.phone ?? ''} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="c-city" className="label mb-1.5 block">City</label>
          <input id="c-city" name="city" defaultValue={company.city ?? ''} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="c-state" className="label mb-1.5 block">State</label>
          <input id="c-state" name="state" defaultValue={company.state ?? ''} className="field text-xs" />
        </div>
        <div>
          <label htmlFor="c-fiscal" className="label mb-1.5 block">Fiscal year starts</label>
          <select id="c-fiscal" name="fiscalYearStartMonth" defaultValue={company.fiscalYearStartMonth} className="field text-xs">
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Financial defaults
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label htmlFor="c-margin" className="label mb-1.5 block">Target gross margin (0-1)</label>
            <input id="c-margin" name="targetMarginPct" type="number" step="0.01" min="0" max="1" defaultValue={company.targetMarginPct} className="field text-xs" />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>Drives the margin health flag on every project</p>
          </div>
          <div>
            <label htmlFor="c-retention" className="label mb-1.5 block">Default retention (0-1)</label>
            <input id="c-retention" name="defaultRetentionPct" type="number" step="0.01" min="0" max="0.5" defaultValue={company.defaultRetentionPct} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="c-burden" className="label mb-1.5 block">Default labor burden (0-1)</label>
            <input id="c-burden" name="defaultLaborBurdenPct" type="number" step="0.01" min="0" max="1" defaultValue={company.defaultLaborBurdenPct} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="c-overhead" className="label mb-1.5 block">Default overhead (0-1)</label>
            <input id="c-overhead" name="defaultOverheadPct" type="number" step="0.01" min="0" max="1" defaultValue={company.defaultOverheadPct} className="field text-xs" />
            <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>Applied to revenue in the company profit forecast</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <Submit />
      </div>
    </form>
  )
}
