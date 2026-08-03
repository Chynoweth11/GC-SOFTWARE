'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Adding…' : 'Add opportunity'}
    </button>
  )
}

export function BidForm({
  clients,
  action,
}: {
  clients: { id: string; label: string }[]
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
          Opportunity added to the pipeline.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <label htmlFor="b-number" className="label mb-1.5 block">Bid number</label>
          <input id="b-number" name="number" required className="field text-xs" placeholder="B-26-025" />
        </div>
        <div className="lg:col-span-2">
          <label htmlFor="b-name" className="label mb-1.5 block">Opportunity</label>
          <input id="b-name" name="name" required className="field text-xs" />
        </div>
        <div>
          <label htmlFor="b-client" className="label mb-1.5 block">Client</label>
          <select id="b-client" name="clientId" className="field text-xs">
            <option value="">New / unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="b-contact" className="label mb-1.5 block">Contact</label>
          <input id="b-contact" name="clientContact" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="b-type" className="label mb-1.5 block">Client type</label>
          <select id="b-type" name="clientType" className="field text-xs" defaultValue="COMMERCIAL">
            <option value="RESIDENTIAL">Residential</option>
            <option value="COMMERCIAL">Commercial</option>
            <option value="PUBLIC">Public / bid</option>
            <option value="DEVELOPER">Developer</option>
            <option value="INSTITUTIONAL">Institutional</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div>
          <label htmlFor="b-source" className="label mb-1.5 block">Lead source</label>
          <input id="b-source" name="leadSource" className="field text-xs" placeholder="Referral, plan room, website" />
        </div>
        <div>
          <label htmlFor="b-location" className="label mb-1.5 block">Location</label>
          <input id="b-location" name="location" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="b-estimator" className="label mb-1.5 block">Estimator</label>
          <input id="b-estimator" name="estimator" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="b-due" className="label mb-1.5 block">Bid due</label>
          <input id="b-due" name="bidDue" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="b-value" className="label mb-1.5 block">Estimated value</label>
          <input id="b-value" name="estimatedValue" type="number" step="1000" min="0" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="b-prob" className="label mb-1.5 block">Win probability (0–1)</label>
          <input id="b-prob" name="winProbability" type="number" step="0.05" min="0" max="1" className="field text-xs" defaultValue="0.3" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label htmlFor="b-status" className="label mb-1.5 block">Status</label>
          <select id="b-status" name="status" className="field text-xs" defaultValue="LEAD">
            <option value="LEAD">Lead</option>
            <option value="QUALIFYING">Qualifying</option>
            <option value="ESTIMATING">Estimating</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="PENDING_DECISION">Pending decision</option>
            <option value="ON_HOLD">On hold</option>
          </select>
        </div>
        <div>
          <label htmlFor="b-followup" className="label mb-1.5 block">Next follow-up</label>
          <input id="b-followup" name="nextFollowUp" type="date" className="field text-xs" />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="b-action" className="label mb-1.5 block">Next action</label>
          <input id="b-action" name="nextAction" className="field text-xs" placeholder="What needs doing to move this forward" />
        </div>
      </div>

      <div className="flex justify-end">
        <Submit />
      </div>
    </form>
  )
}
