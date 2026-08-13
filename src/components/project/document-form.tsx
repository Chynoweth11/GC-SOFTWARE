'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { money, percent } from '@/lib/format'

/**
 * Raising or editing a contract document.
 *
 * The form makes the two pricing modes an explicit choice rather than a hidden
 * one. Priced from lines is the ordinary way and gives the takeoff, the markup
 * chain and a margin that cannot be typed in wrong. A lump sum is for a
 * document recorded off paper, and choosing it puts the two amounts in front of
 * the user with the margin between them worked out live, so a document that
 * loses money is visible before it is saved.
 */

export interface DocumentDefaults {
  id?: string
  /** When the document last moved. Absent when raising a new one. */
  updatedAt?: string
  number: string
  documentKind: string
  type: string
  status: string
  description: string
  origin: string | null
  counterparty: string | null
  reference: string | null
  tradeId: string | null
  dateInitiated: string | null
  dateSubmitted: string | null
  anticipatedApproval: string | null
  priceFromLines: boolean
  enteredOwnerAmount: number
  enteredCostAmount: number
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
  probabilityPct: number
  scheduleImpactDays: number
  postsToBudget: boolean
  notes: string | null
  /** True once approved, which locks everything that moves money. */
  locked: boolean
}

export const DOCUMENT_KIND_OPTIONS: [string, string][] = [
  ['CHANGE_ORDER', 'Change order'],
  ['CONTRACT', 'Contract'],
  ['CONTRACT_AMENDMENT', 'Contract amendment'],
  ['ADDENDUM', 'Addendum'],
  ['TIME_AND_MATERIALS', 'Time and materials ticket'],
  ['OWNER_CHANGE', 'Owner change'],
  ['SUBCONTRACT_CHANGE', 'Subcontract change'],
  ['OTHER', 'Other document'],
]

export const DOCUMENT_STATUS_OPTIONS: [string, string][] = [
  ['DRAFT', 'Draft'],
  ['INTERNAL_REVIEW', 'Internal review'],
  ['READY_TO_SEND', 'Ready to send'],
  ['SENT_FOR_SIGNATURE', 'Sent for signature'],
  ['PARTIALLY_SIGNED', 'Partially signed'],
  ['FULLY_SIGNED', 'Fully signed'],
  ['REJECTED', 'Rejected'],
  ['CANCELLED', 'Cancelled'],
  ['VOIDED', 'Voided'],
  ['SUPERSEDED', 'Superseded'],
]

const TYPE_OPTIONS: [string, string][] = [
  ['OWNER_REQUEST', 'Owner request'],
  ['DESIGN_CHANGE', 'Design change'],
  ['FIELD_CONDITION', 'Field condition'],
  ['ALLOWANCE_RECONCILE', 'Allowance reconciliation'],
  ['ASI_DRIVEN', 'Architect instruction'],
  ['BACKCHARGE', 'Backcharge'],
  ['TIME_ONLY', 'Time only'],
  ['INTERNAL_BUDGET', 'Internal budget move'],
]

const MARKUPS: [keyof DocumentDefaults, string, string][] = [
  ['laborBurdenPct', 'Labor burden', 'On labor, unless the rate came from the classification library'],
  ['salesTaxPct', 'Sales tax', 'On material'],
  ['smallToolsPct', 'Small tools', 'On labor'],
  ['contingencyPct', 'Contingency', 'On direct cost plus small tools'],
  ['overheadPct', 'Overhead', 'On the cost subtotal'],
  ['profitPct', 'Profit', 'On the cost subtotal plus overhead'],
  ['glInsurancePct', 'General liability', 'On the subtotal'],
  ['bondPct', 'Bond', 'On the subtotal'],
  ['exciseTaxPct', 'Excise tax', 'On the subtotal'],
]

export function DocumentForm({
  projectId,
  defaults,
  trades,
  save,
  onDone,
  onCancel,
}: {
  projectId: string
  defaults?: DocumentDefaults
  trades: { id: string; label: string }[]
  save: (formData: FormData) => Promise<{ error?: string; id?: string }>
  onDone?: (id?: string) => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [priceFromLines, setPriceFromLines] = useState(defaults?.priceFromLines ?? true)
  const [owner, setOwner] = useState(defaults?.enteredOwnerAmount ?? 0)
  const [cost, setCost] = useState(defaults?.enteredCostAmount ?? 0)

  const locked = defaults?.locked ?? false
  const margin = owner - cost
  const marginPct = owner ? margin / owner : 0

  return (
    <form
      action={async (formData) => {
        setBusy(true)
        setError(null)
        const result = await save(formData)
        setBusy(false)
        if (result?.error) {
          setError(result.error)
          return
        }
        router.refresh()
        onDone?.(result?.id)
      }}
      className="space-y-4"
    >
      {defaults?.id && <input type="hidden" name="id" value={defaults.id} />}
      {/*
        What the document looked like when this form was opened. The action
        refuses the save if somebody else has changed it since.
      */}
      {defaults?.updatedAt && <input type="hidden" name="expectedUpdatedAt" value={defaults.updatedAt} />}
      <input type="hidden" name="projectId" value={projectId} />

      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {locked && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
        >
          This document is approved, so its amount is already in the contract value and the budget. The description and
          the reference can still be corrected; anything that would move money is locked until the approval is
          withdrawn.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Number
          </span>
          <input
            name="number"
            defaultValue={defaults?.number ?? ''}
            required
            placeholder="CO-001"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Kind
          </span>
          <select name="documentKind" defaultValue={defaults?.documentKind ?? 'CHANGE_ORDER'} className="field mt-1 w-full text-sm">
            {DOCUMENT_KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Why it arose
          </span>
          <select name="type" defaultValue={defaults?.type ?? 'OWNER_REQUEST'} className="field mt-1 w-full text-sm">
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Status
          </span>
          <select name="status" defaultValue={defaults?.status ?? 'DRAFT'} className="field mt-1 w-full text-sm">
            {DOCUMENT_STATUS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            No status puts money into the project. Only the approval does that.
          </span>
        </label>

        <label className="block lg:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Description
          </span>
          <input
            name="description"
            defaultValue={defaults?.description ?? ''}
            required
            placeholder="What is changing"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            With
          </span>
          <input
            name="counterparty"
            defaultValue={defaults?.counterparty ?? ''}
            placeholder="The owner, a subcontractor"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Signature reference
          </span>
          <input
            name="reference"
            defaultValue={defaults?.reference ?? ''}
            placeholder="Envelope or file reference"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Origin
          </span>
          <input name="origin" defaultValue={defaults?.origin ?? ''} placeholder="RFI, ASI, field" className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Trade
          </span>
          <select name="tradeId" defaultValue={defaults?.tradeId ?? ''} className="field mt-1 w-full text-sm">
            <option value="">Not set</option>
            {trades.map((trade) => (
              <option key={trade.id} value={trade.id}>
                {trade.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Initiated
          </span>
          <input type="date" name="dateInitiated" defaultValue={defaults?.dateInitiated ?? ''} className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Submitted
          </span>
          <input type="date" name="dateSubmitted" defaultValue={defaults?.dateSubmitted ?? ''} className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Expected approval
          </span>
          <input
            type="date"
            name="anticipatedApproval"
            defaultValue={defaults?.anticipatedApproval ?? ''}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Probability
          </span>
          <input
            name="probabilityPct"
            defaultValue={defaults ? String(Math.round(defaults.probabilityPct * 100)) : '50'}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Used for weighted exposure only. It never reaches the contract value.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Schedule impact, days
          </span>
          <input
            name="scheduleImpactDays"
            defaultValue={defaults ? String(defaults.scheduleImpactDays) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>
      </div>

      <fieldset
        className="rounded-lg border p-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)' }}
      >
        <legend className="px-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          How it is priced
        </legend>

        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text)' }}>
          <input
            type="checkbox"
            name="priceFromLines"
            checked={priceFromLines}
            disabled={locked}
            onChange={(event) => setPriceFromLines(event.target.checked)}
          />
          Price it from its own lines, like a takeoff
        </label>
        <p className="mt-1 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          {priceFromLines
            ? 'Quantities, labor hours, material, equipment and subcontract on each line, then the markup chain below. The amount and the margin follow from them.'
            : 'A lump sum taken off paper. Lines can still be added to allocate the cost to budget lines, but the amounts below are what count.'}
        </p>

        {!priceFromLines && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Amount to the counterparty
              </span>
              <input
                name="enteredOwnerAmount"
                defaultValue={defaults ? String(defaults.enteredOwnerAmount) : ''}
                onChange={(event) => setOwner(Number(event.target.value.replace(/[$,\s]/g, '')) || 0)}
                disabled={locked}
                className="field mt-1 w-full text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Cost to us
              </span>
              <input
                name="enteredCostAmount"
                defaultValue={defaults ? String(defaults.enteredCostAmount) : ''}
                onChange={(event) => setCost(Number(event.target.value.replace(/[$,\s]/g, '')) || 0)}
                disabled={locked}
                className="field mt-1 w-full text-sm"
              />
            </label>
            <div className="flex flex-col justify-end">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Margin
              </span>
              <span
                className="tnum text-sm font-medium"
                style={{ color: margin < 0 ? 'var(--adverse)' : 'var(--favorable)' }}
              >
                {money(margin)} · {percent(marginPct)}
              </span>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
        <legend className="px-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Markup chain
        </legend>
        <p className="mb-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          Applied in the same order as the bid summary, so a change order is priced the way the job was priced. Each is
          a percentage.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MARKUPS.map(([key, label, basis]) => (
            <label key={key} className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {label}
              </span>
              <input
                name={key}
                defaultValue={defaults ? String(Number(((defaults[key] as number) * 100).toFixed(4))) : '0'}
                disabled={locked}
                className="field mt-1 w-full text-sm"
                title={basis}
              />
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Round to
            </span>
            <input
              name="roundToNearest"
              defaultValue={defaults ? String(defaults.roundToNearest) : '0'}
              disabled={locked}
              className="field mt-1 w-full text-sm"
              title="A dollar amount. Zero leaves the total unrounded."
            />
          </label>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <textarea name="notes" rows={2} defaultValue={defaults?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            name="postsToBudget"
            defaultChecked={defaults ? defaults.postsToBudget : true}
            disabled={locked}
          />
          Post the cost to the budget when it is approved
        </label>
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {defaults?.id ? 'Save document' : 'Raise it'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
