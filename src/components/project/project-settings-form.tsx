'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

interface ProjectValues {
  id: string
  number: string
  name: string
  clientId: string | null
  address: string | null
  city: string | null
  state: string | null
  projectType: string | null
  deliveryMethod: string | null
  architect: string | null
  pmUserId: string | null
  superintendent: string | null
  status: string
  noticeToProceed: string
  contractStart: string
  contractCompletion: string
  forecastCompletion: string
  dataDate: string
  originalContractSum: number
  ownerRetentionPct: number
  defaultSubRetentionPct: number
  targetMarginPct: number
  laborBurdenPct: number
  overheadPct: number
  workDaysPerWeek: number
  safetyScore: number | null
  qualityScore: number | null
  clientSatScore: number | null
  notes: string | null
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving...' : 'Save project setup'}
    </button>
  )
}

function Field({
  id,
  label,
  children,
  hint,
}: {
  id: string
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function ProjectSettingsForm({
  action,
  project,
  clients,
  managers,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>
  project: ProjectValues
  clients: { id: string; label: string }[]
  managers: { id: string; label: string }[]
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
      className="card space-y-5 p-4"
    >
      <input type="hidden" name="projectId" value={project.id} />

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
          Saved. Every change was written to the project&apos;s change history.
        </div>
      )}

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Identification
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Field id="p-number" label="Job number">
            <input id="p-number" name="number" required defaultValue={project.number} className="field text-xs" />
          </Field>
          <Field id="p-name" label="Project name">
            <input id="p-name" name="name" required defaultValue={project.name} className="field text-xs" />
          </Field>
          <Field id="p-client" label="Client">
            <select id="p-client" name="clientId" defaultValue={project.clientId ?? ''} className="field text-xs">
              <option value="">Unassigned</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="p-status" label="Status">
            <select id="p-status" name="status" defaultValue={project.status} className="field text-xs">
              {['BIDDING', 'AWARDED', 'PRECONSTRUCTION', 'UNDER_CONSTRUCTION', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'].map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </Field>
          <Field id="p-address" label="Address">
            <input id="p-address" name="address" defaultValue={project.address ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-city" label="City">
            <input id="p-city" name="city" defaultValue={project.city ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-state" label="State">
            <input id="p-state" name="state" defaultValue={project.state ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-type" label="Project type">
            <input id="p-type" name="projectType" defaultValue={project.projectType ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-delivery" label="Delivery method">
            <input id="p-delivery" name="deliveryMethod" defaultValue={project.deliveryMethod ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-architect" label="Architect">
            <input id="p-architect" name="architect" defaultValue={project.architect ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-pm" label="Project manager">
            <select id="p-pm" name="pmUserId" defaultValue={project.pmUserId ?? ''} className="field text-xs">
              <option value="">Unassigned</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="p-super" label="Superintendent">
            <input id="p-super" name="superintendent" defaultValue={project.superintendent ?? ''} className="field text-xs" />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Key dates
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Field id="p-ntp" label="Notice to proceed">
            <input id="p-ntp" name="noticeToProceed" type="date" defaultValue={project.noticeToProceed} className="field text-xs" />
          </Field>
          <Field id="p-start" label="Contract start">
            <input id="p-start" name="contractStart" type="date" defaultValue={project.contractStart} className="field text-xs" />
          </Field>
          <Field id="p-completion" label="Contract completion">
            <input id="p-completion" name="contractCompletion" type="date" defaultValue={project.contractCompletion} className="field text-xs" />
          </Field>
          <Field id="p-forecast" label="Forecast completion">
            <input id="p-forecast" name="forecastCompletion" type="date" defaultValue={project.forecastCompletion} className="field text-xs" />
          </Field>
          <Field id="p-datadate" label="Data date" hint="Everything on the project re-times off this one date.">
            <input id="p-datadate" name="dataDate" type="date" defaultValue={project.dataDate} className="field text-xs" />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Commercial terms
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Field id="p-contract" label="Original contract sum" hint="Approved change orders add to this automatically.">
            <input id="p-contract" name="originalContractSum" type="number" step="0.01" defaultValue={project.originalContractSum} className="field text-xs" />
          </Field>
          <Field id="p-ownerret" label="Owner retention (0-1)">
            <input id="p-ownerret" name="ownerRetentionPct" type="number" step="0.01" min="0" max="0.5" defaultValue={project.ownerRetentionPct} className="field text-xs" />
          </Field>
          <Field id="p-subret" label="Default sub retention (0-1)">
            <input id="p-subret" name="defaultSubRetentionPct" type="number" step="0.01" min="0" max="0.5" defaultValue={project.defaultSubRetentionPct} className="field text-xs" />
          </Field>
          <Field id="p-margin" label="Target margin (0-1)">
            <input id="p-margin" name="targetMarginPct" type="number" step="0.01" min="0" max="1" defaultValue={project.targetMarginPct} className="field text-xs" />
          </Field>
          <Field id="p-burden" label="Labor burden (0-1)">
            <input id="p-burden" name="laborBurdenPct" type="number" step="0.01" min="0" max="1" defaultValue={project.laborBurdenPct} className="field text-xs" />
          </Field>
          <Field id="p-overhead" label="Overhead allocation (0-1)">
            <input id="p-overhead" name="overheadPct" type="number" step="0.01" min="0" max="1" defaultValue={project.overheadPct} className="field text-xs" />
          </Field>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Performance
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Field id="p-workdays" label="Work days per week">
            <input id="p-workdays" name="workDaysPerWeek" type="number" min="1" max="7" defaultValue={project.workDaysPerWeek} className="field text-xs" />
          </Field>
          <Field id="p-safety" label="Safety score (1-5)">
            <input id="p-safety" name="safetyScore" type="number" step="0.1" min="0" max="5" defaultValue={project.safetyScore ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-quality" label="Quality score (1-5)">
            <input id="p-quality" name="qualityScore" type="number" step="0.1" min="0" max="5" defaultValue={project.qualityScore ?? ''} className="field text-xs" />
          </Field>
          <Field id="p-clientsat" label="Client satisfaction (1-5)">
            <input id="p-clientsat" name="clientSatScore" type="number" step="0.1" min="0" max="5" defaultValue={project.clientSatScore ?? ''} className="field text-xs" />
          </Field>
        </div>
      </div>

      <div>
        <label htmlFor="p-notes" className="label mb-1.5 block">
          Notes
        </label>
        <textarea id="p-notes" name="notes" rows={2} defaultValue={project.notes ?? ''} className="field text-xs" />
      </div>

      <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <Submit />
      </div>
    </form>
  )
}
