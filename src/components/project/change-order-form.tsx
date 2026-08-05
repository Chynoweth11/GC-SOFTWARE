'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { money, percent } from '@/lib/format'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving...' : 'Raise change order'}
    </button>
  )
}

export function ChangeOrderForm({
  projectId,
  trades,
  costCodes,
  action,
}: {
  projectId: string
  trades: { id: string; label: string }[]
  costCodes: { id: string; label: string }[]
  action: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [ownerAmount, setOwnerAmount] = useState(0)
  const [costAmount, setCostAmount] = useState(0)

  const margin = ownerAmount - costAmount
  const marginPct = ownerAmount ? margin / ownerAmount : 0

  return (
    <form
      action={async (formData) => {
        setError(null)
        setSaved(false)
        const result = await action(formData)
        if (result?.error) setError(result.error)
        else {
          setSaved(true)
          setOwnerAmount(0)
          setCostAmount(0)
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
          Change order raised. If it was created as approved, the contract sum and budget have already moved.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <div>
          <label htmlFor="co-number" className="label mb-1.5 block">
            Number
          </label>
          <input id="co-number" name="number" required className="field text-xs" placeholder="CO-006" />
        </div>
        <div>
          <label htmlFor="co-type" className="label mb-1.5 block">
            Type
          </label>
          <select id="co-type" name="type" className="field text-xs" defaultValue="OWNER_REQUEST">
            <option value="OWNER_REQUEST">Owner request</option>
            <option value="DESIGN_CHANGE">Design change</option>
            <option value="FIELD_CONDITION">Field condition</option>
            <option value="ALLOWANCE_RECONCILE">Allowance reconcile</option>
            <option value="ASI_DRIVEN">ASI driven</option>
            <option value="BACKCHARGE">Backcharge</option>
            <option value="TIME_ONLY">Time only</option>
            <option value="INTERNAL_BUDGET">Internal budget change</option>
          </select>
        </div>
        <div>
          <label htmlFor="co-status" className="label mb-1.5 block">
            Status
          </label>
          <select id="co-status" name="status" className="field text-xs" defaultValue="PENDING">
            <option value="DRAFT">Draft</option>
            <option value="PRICING">Pricing</option>
            <option value="PENDING">Pending</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="UNDER_REVIEW">Under review</option>
            <option value="APPROVED">Approved</option>
            <option value="EXECUTED">Executed</option>
            <option value="REJECTED">Rejected</option>
            <option value="VOID">Void</option>
          </select>
        </div>
        <div>
          <label htmlFor="co-trade" className="label mb-1.5 block">
            Trade
          </label>
          <select id="co-trade" name="tradeId" className="field text-xs">
            <option value="">Unassigned</option>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="co-origin" className="label mb-1.5 block">
            Origin
          </label>
          <input id="co-origin" name="origin" className="field text-xs" placeholder="RFI-004, ASI-02, Field" />
        </div>
      </div>

      <div>
        <label htmlFor="co-description" className="label mb-1.5 block">
          Description
        </label>
        <input id="co-description" name="description" required className="field text-xs" placeholder="What the change covers" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <label htmlFor="co-owner" className="label mb-1.5 block">
            Owner amount
          </label>
          <input
            id="co-owner"
            name="ownerAmount"
            type="number"
            step="0.01"
            required
            className="field text-xs"
            onChange={(e) => setOwnerAmount(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label htmlFor="co-cost" className="label mb-1.5 block">
            Cost amount
          </label>
          <input
            id="co-cost"
            name="costAmount"
            type="number"
            step="0.01"
            required
            className="field text-xs"
            onChange={(e) => setCostAmount(Number(e.target.value) || 0)}
          />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="co-code" className="label mb-1.5 block">
            Cost impact charges
          </label>
          <select id="co-code" name="costCodeId" className="field text-xs">
            <option value="">No budget impact</option>
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="co-probability" className="label mb-1.5 block">
            Probability (0-1)
          </label>
          <input id="co-probability" name="probabilityPct" type="number" step="0.05" min="0" max="1" className="field text-xs" defaultValue="0.5" />
        </div>
        <div>
          <label htmlFor="co-schedule" className="label mb-1.5 block">
            Schedule days
          </label>
          <input id="co-schedule" name="scheduleImpactDays" type="number" step="1" className="field text-xs" defaultValue="0" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="co-initiated" className="label mb-1.5 block">
            Date initiated
          </label>
          <input id="co-initiated" name="dateInitiated" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="co-submitted" className="label mb-1.5 block">
            Date submitted
          </label>
          <input id="co-submitted" name="dateSubmitted" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="co-anticipated" className="label mb-1.5 block">
            Anticipated approval
          </label>
          <input id="co-anticipated" name="anticipatedApproval" type="date" className="field text-xs" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Margin on this change:{' '}
          <span className="tnum font-medium" style={{ color: margin < 0 ? 'var(--adverse)' : 'var(--favorable)' }}>
            {money(margin, { dash: false })} ({percent(marginPct)})
          </span>
        </div>
        <Submit />
      </div>
    </form>
  )
}
