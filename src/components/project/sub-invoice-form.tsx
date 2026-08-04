'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { money } from '@/lib/format'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Logging…' : 'Log invoice'}
    </button>
  )
}

export function SubInvoiceForm({
  projectId,
  commitments,
  costCodes,
  action,
}: {
  projectId: string
  commitments: { id: string; vendorId: string; label: string; retentionPct: number }[]
  costCodes: { id: string; label: string }[]
  action: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [amount, setAmount] = useState(0)
  const [retention, setRetention] = useState(0.05)

  if (commitments.length === 0) {
    return (
      <div className="card p-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        Add a subcontract on the commitments tab before logging invoices.
      </div>
    )
  }

  return (
    <form
      action={async (formData) => {
        setError(null)
        setSaved(false)
        const result = await action(formData)
        if (result?.error) setError(result.error)
        else {
          setSaved(true)
          setAmount(0)
        }
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
          Invoice logged and the cost posted to the job. No second entry needed.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label htmlFor="si-commitment" className="label mb-1.5 block">
            Subcontract
          </label>
          <select
            id="si-commitment"
            name="commitmentId"
            required
            className="field text-xs"
            onChange={(e) => {
              const found = commitments.find((c) => c.id === e.target.value)
              if (found) setRetention(found.retentionPct)
            }}
          >
            <option value="">Select</option>
            {commitments.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="si-number" className="label mb-1.5 block">
            Invoice number
          </label>
          <input id="si-number" name="invoiceNumber" required className="field text-xs" />
        </div>
        <div>
          <label htmlFor="si-period" className="label mb-1.5 block">
            Period end
          </label>
          <input id="si-period" name="periodEnd" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="si-amount" className="label mb-1.5 block">
            Amount
          </label>
          <input
            id="si-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            className="field text-xs"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label htmlFor="si-retention" className="label mb-1.5 block">
            Retention (0–1)
          </label>
          <input
            id="si-retention"
            name="retentionPct"
            type="number"
            step="0.01"
            min="0"
            max="0.5"
            className="field text-xs"
            value={retention}
            onChange={(e) => setRetention(Number(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="si-code" className="label mb-1.5 block">
            Line item (defaults to the subcontract&apos;s)
          </label>
          <select id="si-code" name="costCodeId" className="field text-xs">
            <option value="">Use the subcontract&apos;s line item</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="si-received" className="label mb-1.5 block">
            Date received
          </label>
          <input id="si-received" name="dateReceived" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="si-attachment" className="label mb-1.5 block">
            Backup document
          </label>
          <input id="si-attachment" name="attachmentName" className="field text-xs" placeholder="Invoice file name" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" name="lienWaiverReceived" />
          Lien waiver received
        </label>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Retention {money(amount * retention, { dash: false })} · net payable{' '}
          <span className="tnum font-medium" style={{ color: 'var(--text)' }}>
            {money(amount - amount * retention, { dash: false })}
          </span>
        </div>
        <Submit />
      </div>
    </form>
  )
}
