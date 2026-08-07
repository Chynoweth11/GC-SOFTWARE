'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Calculated, EmptyState } from '@/components/ui'
import { money, number as fmtNumber, percent } from '@/lib/format'

/**
 * The priced breakdown behind a change order.
 *
 * Deliberately the takeoff table, because a change order is a small estimate:
 * a measure and its dimensions give the quantity, waste inflates it, labor is
 * hours times a rate, material is taxed, equipment and subcontract go in at
 * their unit costs, and anything that is none of those four goes in the last
 * column. No line total is stored; every figure to the right of the entered
 * boxes is worked out each time the page is drawn.
 */

export interface LineRow {
  id: string
  costCodeId: string
  costCodeLabel: string
  category: string
  description: string
  scope: string | null
  divisionCode: string | null
  measure: string
  count: number
  length: number
  width: number
  depth: number
  netQtyOverride: number | null
  uom: string | null
  wastePct: number
  laborClass: string | null
  laborHrsPerUnit: number
  laborRateOverride: number | null
  materialUnitCost: number
  equipmentUnitCost: number
  subUnitCost: number
  otherUnitCost: number
  notes: string | null
  derived: {
    netQty: number
    grossQty: number
    laborRate: number
    laborRateSource: string | null
    laborHours: number
    laborCost: number
    materialCost: number
    equipmentCost: number
    subCost: number
    otherCost: number
    totalCost: number
    unitCost: number
    qaFlags: string[]
  }
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const MEASURES: [string, string][] = [
  ['LS', 'Lump sum'],
  ['EA', 'Each'],
  ['LF', 'Linear feet'],
  ['SF', 'Square feet'],
  ['SY', 'Square yards'],
  ['CY', 'Cubic yards'],
  ['CF', 'Cubic feet'],
  ['TON', 'Tons'],
  ['LB', 'Pounds'],
  ['HR', 'Hours'],
  ['DAY', 'Days'],
  ['ALLOWANCE', 'Allowance'],
]

const CATEGORIES: [string, string][] = [
  ['LABOR', 'Labor'],
  ['MATERIAL', 'Material'],
  ['EQUIPMENT', 'Equipment'],
  ['SUBCONTRACT', 'Subcontract'],
  ['GENERAL_CONDITIONS', 'General conditions'],
  ['OVERHEAD', 'Overhead'],
  ['CONTINGENCY', 'Contingency'],
  ['OTHER', 'Other'],
]

export function DocumentLines({
  documentId,
  rows,
  costCodes,
  laborClasses,
  canEdit,
  locked,
  save,
  remove,
}: {
  documentId: string
  rows: LineRow[]
  costCodes: { id: string; label: string; category: string }[]
  laborClasses: { name: string; rate: number }[]
  canEdit: boolean
  /** True once approved, when the pricing may no longer be touched. */
  locked: boolean
  save: Action
  remove: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function run(action: Action, formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await action(formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
      return false
    }
    router.refresh()
    return true
  }

  const editable = canEdit && !locked

  const totals = rows.reduce(
    (sum, row) => ({
      hours: sum.hours + row.derived.laborHours,
      labor: sum.labor + row.derived.laborCost,
      material: sum.material + row.derived.materialCost,
      equipment: sum.equipment + row.derived.equipmentCost,
      sub: sum.sub + row.derived.subCost,
      other: sum.other + row.derived.otherCost,
      total: sum.total + row.derived.totalCost,
    }),
    { hours: 0, labor: 0, material: 0, equipment: 0, sub: 0, other: 0, total: 0 },
  )

  return (
    <div className="space-y-3">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <EmptyState
          icon="◦"
          title="Nothing priced yet"
          description="Add a line for each piece of scope. Quantity comes from the measure and the dimensions, labor from hours at a rate, and the markup chain runs on the total."
          action={
            editable ? (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Add the first line
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Cost code</th>
                  <th>Cost type</th>
                  <th>Measure</th>
                  <th className="num">Quantity</th>
                  <th className="num">Waste</th>
                  <th className="num">Labor hours</th>
                  <th className="num">Labor rate</th>
                  <th className="num">Labor</th>
                  <th className="num">Material</th>
                  <th className="num">Equipment</th>
                  <th className="num">Subcontract</th>
                  <th className="num">Other</th>
                  <th className="num">Line total</th>
                  {editable && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editing === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={editable ? 15 : 14} className="top">
                        <LineForm
                          documentId={documentId}
                          row={row}
                          costCodes={costCodes}
                          laborClasses={laborClasses}
                          busy={busy}
                          onCancel={() => setEditing(null)}
                          onSubmit={async (formData) => {
                            if (await run(save, formData)) setEditing(null)
                          }}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td className="wrap">
                        <span className="font-medium">{row.description}</span>
                        {row.scope && (
                          <div className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                            {row.scope}
                          </div>
                        )}
                        {row.derived.qaFlags.length > 0 && (
                          <div className="wrap text-[11px]" style={{ color: 'var(--caution)' }}>
                            {row.derived.qaFlags.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.costCodeLabel}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {CATEGORIES.find(([value]) => value === row.category)?.[1] ?? row.category}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {MEASURES.find(([value]) => value === row.measure)?.[1] ?? row.measure}
                      </td>
                      <td className="num">
                        <Calculated formula="from the measure and dimensions">
                          {fmtNumber(row.derived.netQty, 2)}
                        </Calculated>
                        {row.uom && (
                          <span className="ml-1 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                            {row.uom}
                          </span>
                        )}
                      </td>
                      <td className="num">{row.wastePct ? percent(row.wastePct, 1) : '-'}</td>
                      <td className="num">{row.derived.laborHours ? fmtNumber(row.derived.laborHours, 1) : '-'}</td>
                      <td className="num" title={row.derived.laborRateSource ?? undefined}>
                        {row.derived.laborRate ? money(row.derived.laborRate, { cents: true }) : '-'}
                      </td>
                      <td className="num">{money(row.derived.laborCost)}</td>
                      <td className="num">{money(row.derived.materialCost)}</td>
                      <td className="num">{money(row.derived.equipmentCost)}</td>
                      <td className="num">{money(row.derived.subCost)}</td>
                      <td className="num">{money(row.derived.otherCost)}</td>
                      <td className="num font-semibold">{money(row.derived.totalCost)}</td>
                      {editable && (
                        <td className="no-print">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                              Edit
                            </button>
                            <ConfirmButton
                              label="Remove"
                              confirmLabel="Remove the line"
                              title={`Remove ${row.description}`}
                              description="This changes what this document is worth. The removal is recorded permanently in the audit history."
                              onConfirm={async () => {
                                const formData = new FormData()
                                formData.set('id', row.id)
                                await run(remove, formData)
                              }}
                            />
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={6}>Direct cost</th>
                  <th className="num">{fmtNumber(totals.hours, 1)}</th>
                  <th className="num" />
                  <th className="num">{money(totals.labor)}</th>
                  <th className="num">{money(totals.material)}</th>
                  <th className="num">{money(totals.equipment)}</th>
                  <th className="num">{money(totals.sub)}</th>
                  <th className="num">{money(totals.other)}</th>
                  <th className="num">{money(totals.total)}</th>
                  {editable && <th className="no-print" />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {adding && editable && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
          <LineForm
            documentId={documentId}
            costCodes={costCodes}
            laborClasses={laborClasses}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSubmit={async (formData) => {
              if (await run(save, formData)) setAdding(false)
            }}
          />
        </div>
      )}

      {editable && !adding && rows.length > 0 && (
        <div className="no-print">
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setAdding(true)}>
            Add a line
          </button>
        </div>
      )}

      {locked && canEdit && (
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          This document is approved, so its pricing is locked. Withdraw the approval to change it, which is recorded
          with a reason.
        </p>
      )}
    </div>
  )
}

function LineForm({
  documentId,
  row,
  costCodes,
  laborClasses,
  busy,
  onSubmit,
  onCancel,
}: {
  documentId: string
  row?: LineRow
  costCodes: { id: string; label: string; category: string }[]
  laborClasses: { name: string; rate: number }[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [measure, setMeasure] = useState(row?.measure ?? 'LS')
  const [costCodeId, setCostCodeId] = useState(row?.costCodeId ?? costCodes[0]?.id ?? '')
  const [category, setCategory] = useState(
    row?.category ?? costCodes.find((code) => code.id === costCodeId)?.category ?? 'OTHER',
  )

  // Dimensions only make sense for the measures that use them, so the boxes
  // that would be ignored are not shown at all.
  const usesLength = ['LF', 'SF', 'SY', 'CY', 'CF'].includes(measure)
  const usesWidth = ['SF', 'SY', 'CY', 'CF'].includes(measure)
  const usesDepth = ['CY', 'CF'].includes(measure)

  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="documentId" value={documentId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Scope description
          </span>
          <input
            name="description"
            defaultValue={row?.description ?? ''}
            required
            placeholder="What this line covers"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Cost code
          </span>
          <select
            name="costCodeId"
            value={costCodeId}
            onChange={(event) => {
              setCostCodeId(event.target.value)
              const code = costCodes.find((entry) => entry.id === event.target.value)
              if (code) setCategory(code.category)
            }}
            required
            className="field mt-1 w-full text-sm"
          >
            {costCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Cost type
          </span>
          <select
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="field mt-1 w-full text-sm"
          >
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Measure
          </span>
          <select
            name="measure"
            value={measure}
            onChange={(event) => setMeasure(event.target.value)}
            className="field mt-1 w-full text-sm"
          >
            {MEASURES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Count
          </span>
          <input name="count" defaultValue={row ? String(row.count) : '1'} className="field mt-1 w-full text-sm" />
        </label>

        {usesLength && (
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Length
            </span>
            <input name="length" defaultValue={row ? String(row.length) : '0'} className="field mt-1 w-full text-sm" />
          </label>
        )}
        {usesWidth && (
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Width
            </span>
            <input name="width" defaultValue={row ? String(row.width) : '0'} className="field mt-1 w-full text-sm" />
          </label>
        )}
        {usesDepth && (
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Depth
            </span>
            <input name="depth" defaultValue={row ? String(row.depth) : '0'} className="field mt-1 w-full text-sm" />
          </label>
        )}

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Unit
          </span>
          <input name="uom" defaultValue={row?.uom ?? ''} className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Waste
          </span>
          <input
            name="wastePct"
            defaultValue={row ? String(Number((row.wastePct * 100).toFixed(4))) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Quantity override
          </span>
          <input
            name="netQtyOverride"
            defaultValue={row?.netQtyOverride != null ? String(row.netQtyOverride) : ''}
            placeholder="Leave empty to use the dimensions"
            className="field mt-1 w-full text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Labor class
          </span>
          <input
            name="laborClass"
            defaultValue={row?.laborClass ?? ''}
            list="document-labor-classes"
            placeholder="From the classification library"
            className="field mt-1 w-full text-sm"
          />
          <datalist id="document-labor-classes">
            {laborClasses.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {money(entry.rate, { cents: true })} an hour, loaded
              </option>
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Labor hours per unit
          </span>
          <input
            name="laborHrsPerUnit"
            defaultValue={row ? String(row.laborHrsPerUnit) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Labor rate
          </span>
          <input
            name="laborRateOverride"
            defaultValue={row?.laborRateOverride != null ? String(row.laborRateOverride) : ''}
            placeholder="Leave empty to use the class"
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            A rate typed here is a bare wage and takes the labor burden on top.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Material per unit
          </span>
          <input
            name="materialUnitCost"
            defaultValue={row ? String(row.materialUnitCost) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Equipment per unit
          </span>
          <input
            name="equipmentUnitCost"
            defaultValue={row ? String(row.equipmentUnitCost) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Subcontract per unit
          </span>
          <input
            name="subUnitCost"
            defaultValue={row ? String(row.subUnitCost) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Other per unit
          </span>
          <input
            name="otherUnitCost"
            defaultValue={row ? String(row.otherUnitCost) : '0'}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Permits, allowances, anything that is none of the four.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Scope heading
          </span>
          <input name="scope" defaultValue={row?.scope ?? ''} className="field mt-1 w-full text-sm" />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <input name="notes" defaultValue={row?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save line' : 'Add the line'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
