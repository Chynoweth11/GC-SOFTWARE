'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

interface EstimateValues {
  id: string
  name: string
  status: string
  clientName: string | null
  architect: string | null
  address: string | null
  projectType: string | null
  bidDueDate: string
  estimator: string | null
  drawingSet: string | null
  addenda: string | null
  durationWeeks: number
  buildingAreaSf: number
  laborBurdenPct: number
  salesTaxPct: number
  smallToolsPct: number
  contingencyPct: number
  overheadPct: number
  profitPct: number
  glInsurancePct: number
  bondPct: number
  exciseTaxPct: number
  roundToNearest: number
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Saving…' : 'Save setup'}
    </button>
  )
}

export function EstimateSetupForm({
  action,
  estimate,
  showMarkups,
}: {
  action: (formData: FormData) => Promise<{ error?: string }>
  estimate: EstimateValues
  showMarkups: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const markups: [keyof EstimateValues, string, string][] = [
    ['contingencyPct', 'Contingency', 'Applied to direct cost plus small tools'],
    ['overheadPct', 'Overhead', 'Applied to the cost subtotal'],
    ['profitPct', 'Profit', 'Applied to cost subtotal plus overhead'],
    ['glInsurancePct', 'GL insurance', 'Applied to the subtotal'],
    ['bondPct', 'P&P bond', 'Applied to the subtotal'],
    ['exciseTaxPct', 'B&O / excise tax', 'Applied to the subtotal'],
  ]

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
      <input type="hidden" name="estimateId" value={estimate.id} />

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
          Saved. Every takeoff line and the bid summary have already repriced.
        </div>
      )}

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Project and bid
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <div>
            <label htmlFor="e-name" className="label mb-1.5 block">
              Estimate name
            </label>
            <input id="e-name" name="name" required defaultValue={estimate.name} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-status" className="label mb-1.5 block">
              Status
            </label>
            <select id="e-status" name="status" defaultValue={estimate.status} className="field text-xs">
              {['DRAFT', 'IN_PROGRESS', 'REVIEW', 'SUBMITTED', 'AWARDED', 'LOST', 'ARCHIVED'].map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="e-client" className="label mb-1.5 block">
              Client
            </label>
            <input id="e-client" name="clientName" defaultValue={estimate.clientName ?? ''} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-architect" className="label mb-1.5 block">
              Architect
            </label>
            <input id="e-architect" name="architect" defaultValue={estimate.architect ?? ''} className="field text-xs" />
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="e-address" className="label mb-1.5 block">
              Project address
            </label>
            <input id="e-address" name="address" defaultValue={estimate.address ?? ''} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-type" className="label mb-1.5 block">
              Project type
            </label>
            <input id="e-type" name="projectType" defaultValue={estimate.projectType ?? ''} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-due" className="label mb-1.5 block">
              Bid due date
            </label>
            <input id="e-due" name="bidDueDate" type="date" defaultValue={estimate.bidDueDate} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-estimator" className="label mb-1.5 block">
              Estimator
            </label>
            <input id="e-estimator" name="estimator" defaultValue={estimate.estimator ?? ''} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-drawings" className="label mb-1.5 block">
              Drawing set
            </label>
            <input id="e-drawings" name="drawingSet" defaultValue={estimate.drawingSet ?? ''} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-addenda" className="label mb-1.5 block">
              Addenda acknowledged
            </label>
            <input id="e-addenda" name="addenda" defaultValue={estimate.addenda ?? ''} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-duration" className="label mb-1.5 block">
              Duration (weeks)
            </label>
            <input id="e-duration" name="durationWeeks" type="number" step="0.5" min="0" defaultValue={estimate.durationWeeks} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-area" className="label mb-1.5 block">
              Building area (SF)
            </label>
            <input id="e-area" name="buildingAreaSf" type="number" step="1" min="0" defaultValue={estimate.buildingAreaSf} className="field text-xs" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Factors
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label htmlFor="e-burden" className="label mb-1.5 block">
              Labor burden (0–1)
            </label>
            <input id="e-burden" name="laborBurdenPct" type="number" step="0.001" min="0" max="1" defaultValue={estimate.laborBurdenPct} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-tax" className="label mb-1.5 block">
              Sales tax on materials (0–1)
            </label>
            <input id="e-tax" name="salesTaxPct" type="number" step="0.001" min="0" max="1" defaultValue={estimate.salesTaxPct} className="field text-xs" />
          </div>
          <div>
            <label htmlFor="e-tools" className="label mb-1.5 block">
              Small tools, % of labor (0–1)
            </label>
            <input id="e-tools" name="smallToolsPct" type="number" step="0.001" min="0" max="1" defaultValue={estimate.smallToolsPct} className="field text-xs" />
          </div>
        </div>
      </div>

      {showMarkups && (
        <div>
          <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Markups
          </h3>
          <p className="mb-3 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Compounded in the order listed — the same order the bid summary shows. Set any you do not use to zero.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {markups.map(([key, label, basis]) => (
              <div key={key}>
                <label htmlFor={`e-${key}`} className="label mb-1.5 block">
                  {label} (0–1)
                </label>
                <input
                  id={`e-${key}`}
                  name={key}
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  defaultValue={estimate[key] as number}
                  className="field text-xs"
                />
                <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                  {basis}
                </p>
              </div>
            ))}
            <div>
              <label htmlFor="e-round" className="label mb-1.5 block">
                Round bid to nearest
              </label>
              <input id="e-round" name="roundToNearest" type="number" step="1" min="0" defaultValue={estimate.roundToNearest} className="field text-xs" />
              <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                Zero leaves the bid unrounded
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <Submit />
      </div>
    </form>
  )
}
