'use client'

import { useMemo, useState } from 'react'
import type { EstimateItemDerived } from '@/lib/finance'
import { MEASURE_LABELS } from '@/lib/finance/estimate'
import { money, number as fmtNumber, percent } from '@/lib/format'
import { Pill } from '@/components/ui'

const MEASURES = Object.keys(MEASURE_LABELS) as (keyof typeof MEASURE_LABELS)[]

/** Which dimension inputs matter for a given measure: the rest are disabled. */
const DIMENSIONS: Record<string, ('count' | 'length' | 'width' | 'depth')[]> = {
  EA: ['count'],
  TON: ['count'],
  LB: ['count'],
  HR: ['count'],
  DAY: ['count'],
  LF: ['count', 'length'],
  SF: ['count', 'length', 'width'],
  SY: ['count', 'length', 'width'],
  CF: ['count', 'length', 'width', 'depth'],
  CY: ['count', 'length', 'width', 'depth'],
  LS: ['count'],
  ALLOWANCE: ['count'],
}

export function TakeoffTable({
  estimateId,
  items,
  sections,
  divisions,
  laborClasses,
  equipmentClasses,
  canEdit,
  save,
  remove,
  locked,
}: {
  estimateId: string
  items: EstimateItemDerived[]
  sections: { id: string; label: string }[]
  divisions: { id: string; code: string; label: string }[]
  laborClasses: { className: string; rate: number }[]
  equipmentClasses: { name: string; rate: number }[]
  canEdit: boolean
  save: (formData: FormData) => Promise<{ error?: string }>
  remove: (formData: FormData) => Promise<void>
  locked: boolean
}) {
  const [sectionFilter, setSectionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [measure, setMeasure] = useState<string>('EA')
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let rows = items
    if (sectionFilter) rows = rows.filter((i) => i.sectionId === sectionFilter)
    if (onlyFlagged) rows = rows.filter((i) => i.qaFlags.length > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (i) => i.description.toLowerCase().includes(q) || (i.divisionCode ?? '').toLowerCase().includes(q) || (i.drawingRef ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [items, sectionFilter, search, onlyFlagged])

  const totals = filtered.reduce(
    (a, i) => ({
      laborHours: a.laborHours + i.laborHours,
      laborCost: a.laborCost + i.laborCost,
      equipmentHours: a.equipmentHours + i.equipmentHours,
      materialCost: a.materialCost + i.materialCost,
      equipmentCost: a.equipmentCost + i.equipmentCost,
      subCost: a.subCost + i.subCost,
      totalCost: a.totalCost + i.totalCost,
    }),
    { laborHours: 0, laborCost: 0, equipmentHours: 0, materialCost: 0, equipmentCost: 0, subCost: 0, totalCost: 0 },
  )

  const editingItem = editing && editing !== 'new' ? items.find((i) => i.id === editing) : null
  const activeDimensions = DIMENSIONS[measure] ?? ['count']

  const renderForm = () => (
    <form
      action={async (formData) => {
        setError(null)
        const result = await save(formData)
        if (result?.error) setError(result.error)
        else setEditing(null)
      }}
      className="space-y-2"
    >
      <input type="hidden" name="estimateId" value={estimateId} />
      {editingItem && <input type="hidden" name="itemId" value={editingItem.id} />}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <div className="lg:col-span-2">
          <label className="label mb-1 block" htmlFor="tk-description">
            Description
          </label>
          <input id="tk-description" name="description" required defaultValue={editingItem?.description ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-section">
            Section
          </label>
          <select id="tk-section" name="sectionId" defaultValue={editingItem?.sectionId ?? ''} className="field py-1.5 text-xs">
            <option value="">None</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-division">
            CSI division
          </label>
          <select
            id="tk-division"
            name="divisionId"
            defaultValue={divisions.find((d) => d.code === editingItem?.divisionCode)?.id ?? ''}
            className="field py-1.5 text-xs"
          >
            <option value="">None</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-ref">
            Drawing ref
          </label>
          <input id="tk-ref" name="drawingRef" defaultValue={editingItem?.drawingRef ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-measure">
            Measure
          </label>
          <select
            id="tk-measure"
            name="measure"
            defaultValue={editingItem?.measure ?? 'EA'}
            className="field py-1.5 text-xs"
            onChange={(e) => setMeasure(e.target.value)}
          >
            {MEASURES.map((m) => (
              <option key={m} value={m}>
                {m}: {MEASURE_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-uom">
            UOM label
          </label>
          <input id="tk-uom" name="uom" defaultValue={editingItem?.uom ?? ''} className="field py-1.5 text-xs" placeholder="Optional" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        {(['count', 'length', 'width', 'depth'] as const).map((dim) => (
          <div key={dim}>
            <label className="label mb-1 block" htmlFor={`tk-${dim}`}>
              {dim === 'count' ? 'Count' : dim === 'length' ? 'Length (ft)' : dim === 'width' ? 'Width (ft)' : 'Depth (ft)'}
            </label>
            <input
              id={`tk-${dim}`}
              name={dim}
              type="number"
              step="0.01"
              defaultValue={editingItem?.[dim] ?? ''}
              disabled={!activeDimensions.includes(dim)}
              className="field py-1.5 text-xs"
            />
          </div>
        ))}
        <div>
          <label className="label mb-1 block" htmlFor="tk-waste">
            Waste (0-1)
          </label>
          <input id="tk-waste" name="wastePct" type="number" step="0.01" min="0" max="1" defaultValue={editingItem?.wastePct ?? 0} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-class">
            Labor class
          </label>
          <select id="tk-class" name="laborClass" defaultValue={editingItem?.laborClass ?? ''} className="field py-1.5 text-xs">
            <option value="">None</option>
            {laborClasses.map((c) => (
              <option key={c.className} value={c.className}>
                {c.className}: {money(c.rate)}/hr
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-hrs">
            Hours / unit
          </label>
          <input id="tk-hrs" name="laborHrsPerUnit" type="number" step="0.001" min="0" defaultValue={editingItem?.laborHrsPerUnit ?? ''} className="field py-1.5 text-xs" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <div className="lg:col-span-2">
          <label className="label mb-1 block" htmlFor="tk-machine">
            Machine
          </label>
          <select id="tk-machine" name="equipmentClass" defaultValue={editingItem?.equipmentClass ?? ''} className="field py-1.5 text-xs">
            <option value="">None</option>
            {equipmentClasses.map((machine) => (
              <option key={machine.name} value={machine.name}>
                {machine.name}: {money(machine.rate, { cents: true })}/hr with fuel
              </option>
            ))}
            {/*
              A machine taken off the list stays on the lines that named it,
              so editing one of those lines for any other reason does not
              quietly drop the machine and the cost with it.
            */}
            {editingItem?.equipmentClass &&
              !equipmentClasses.some((machine) => machine.name === editingItem.equipmentClass) && (
                <option value={editingItem.equipmentClass}>{editingItem.equipmentClass}: no longer on the list</option>
              )}
          </select>
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-machine-hrs">
            Machine hrs / unit
          </label>
          <input id="tk-machine-hrs" name="equipmentHrsPerUnit" type="number" step="0.001" min="0" defaultValue={editingItem?.equipmentHrsPerUnit ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-machine-rate">
            Machine rate
          </label>
          <input
            id="tk-machine-rate"
            name="equipmentRateOverride"
            type="number"
            step="0.01"
            min="0"
            placeholder="From the list"
            defaultValue={editingItem?.equipmentRateOverride ?? ''}
            className="field py-1.5 text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
        <div>
          <label className="label mb-1 block" htmlFor="tk-mat">
            Material $/unit
          </label>
          <input id="tk-mat" name="materialUnitCost" type="number" step="0.01" min="0" defaultValue={editingItem?.materialUnitCost ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-equip">
            Equipment $/unit
          </label>
          <input id="tk-equip" name="equipmentUnitCost" type="number" step="0.01" min="0" defaultValue={editingItem?.equipmentUnitCost ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div>
          <label className="label mb-1 block" htmlFor="tk-sub">
            Subcontract $/unit
          </label>
          <input id="tk-sub" name="subUnitCost" type="number" step="0.01" min="0" defaultValue={editingItem?.subUnitCost ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div className="lg:col-span-3">
          <label className="label mb-1 block" htmlFor="tk-notes">
            Notes
          </label>
          <input id="tk-notes" name="notes" defaultValue={editingItem?.notes ?? ''} className="field py-1.5 text-xs" />
        </div>
        <div className="flex items-end gap-2 lg:col-span-2">
          <button type="submit" className="btn btn-primary py-1.5 text-xs">
            {editingItem ? 'Save line' : 'Add line'}
          </button>
          <button type="button" className="btn btn-ghost py-1.5 text-xs" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <input
          className="field w-56 py-1.5 text-xs"
          placeholder="Search description, division or drawing"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search takeoff"
        />
        <select className="field w-auto py-1.5 text-xs" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)} aria-label="Filter by section">
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
          Flagged lines only
        </label>
        {canEdit && (
          <button
            className="btn btn-secondary ml-auto py-1.5 text-xs"
            onClick={() => {
              setMeasure('EA')
              setEditing(editing === 'new' ? null : 'new')
            }}
          >
            Add takeoff line
          </button>
        )}
        <span className={canEdit ? 'text-xs' : 'ml-auto text-xs'} style={{ color: 'var(--text-subtle)' }}>
          {filtered.length} of {items.length} lines
        </span>
      </div>

      {locked && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--surface-inset)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
          This estimate is locked because it has been awarded. It is preserved exactly as it was bid.
        </div>
      )}

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}

      {editing === 'new' && <div className="card p-3">{renderForm()}</div>}

      <div className="card-flush">
        <div className="table-wrap" style={{ maxHeight: '40rem', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Division</th>
                <th>Description</th>
                <th>Drawing</th>
                <th>Measure</th>
                <th className="num">Count</th>
                <th className="num">L</th>
                <th className="num">W</th>
                <th className="num">D</th>
                <th className="num">Net qty</th>
                <th className="num">Waste</th>
                <th className="num">Gross qty</th>
                <th>Labor class</th>
                <th className="num">Hrs/unit</th>
                <th className="num">Rate</th>
                <th className="num">Labor $</th>
                <th>Machine</th>
                <th className="num">Machine hrs</th>
                <th className="num">Machine rate</th>
                <th className="num">Material $</th>
                <th className="num">Equipment $</th>
                <th className="num">Subcontract $</th>
                <th className="num">Total $</th>
                <th>QA</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} style={i.qaFlags.length > 0 ? { background: 'color-mix(in oklab, var(--caution) 6%, transparent)' } : undefined}>
                  <td style={{ color: 'var(--text-muted)' }}>{i.divisionCode ?? '-'}</td>
                  <td className="max-w-[16rem] truncate font-medium" title={i.description}>
                    {i.description}
                  </td>
                  <td style={{ color: 'var(--text-subtle)' }}>{i.drawingRef ?? '-'}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{i.measure}</td>
                  <td className="num">{i.count || '-'}</td>
                  <td className="num">{i.length || '-'}</td>
                  <td className="num">{i.width || '-'}</td>
                  <td className="num">{i.depth || '-'}</td>
                  <td className="num calculated">{fmtNumber(i.netQty, 2)}</td>
                  <td className="num">{i.wastePct ? percent(i.wastePct, 0) : '-'}</td>
                  <td className="num calculated">{fmtNumber(i.grossQty, 2)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{i.laborClass ?? '-'}</td>
                  <td className="num">{i.laborHrsPerUnit || '-'}</td>
                  <td className="num">{i.laborRate ? money(i.laborRate) : '-'}</td>
                  <td className="num">{money(i.laborCost)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{i.equipmentClass ?? '-'}</td>
                  <td className="num">{i.equipmentHours ? fmtNumber(i.equipmentHours, 1) : '-'}</td>
                  <td className="num">{i.equipmentRate ? money(i.equipmentRate, { cents: true }) : '-'}</td>
                  <td className="num">{money(i.materialCost)}</td>
                  <td className="num">{money(i.equipmentCost)}</td>
                  <td className="num">{money(i.subCost)}</td>
                  <td className="num font-medium">{money(i.totalCost)}</td>
                  <td className="max-w-[14rem]">
                    {i.qaFlags.length === 0 ? (
                      <span style={{ color: 'var(--text-subtle)' }}>-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {i.qaFlags.map((f) => (
                          <Pill key={f} tone="caution">
                            {f}
                          </Pill>
                        ))}
                      </div>
                    )}
                  </td>
                  {canEdit && (
                    <td className="no-print">
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost px-1.5 py-0.5 text-[11px]"
                          onClick={() => {
                            setMeasure(i.measure)
                            setEditing(editing === i.id ? null : i.id)
                          }}
                        >
                          Edit
                        </button>
                        <form action={remove}>
                          <input type="hidden" name="itemId" value={i.id} />
                          <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {canEdit && editingItem && (
                <tr>
                  <td colSpan={24} style={{ background: 'var(--surface-inset)' }}>
                    {renderForm()}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={12}>Total, {filtered.length} lines</td>
                <td className="num">{fmtNumber(totals.laborHours, 1)} hr</td>
                <td />
                <td className="num">{money(totals.laborCost)}</td>
                <td />
                <td className="num">{fmtNumber(totals.equipmentHours, 1)} hr</td>
                <td />
                <td className="num">{money(totals.materialCost)}</td>
                <td className="num">{money(totals.equipmentCost)}</td>
                <td className="num">{money(totals.subCost)}</td>
                <td className="num">{money(totals.totalCost)}</td>
                <td colSpan={canEdit ? 2 : 1} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
