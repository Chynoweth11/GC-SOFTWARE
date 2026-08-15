'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Calculated, EmptyState } from '@/components/ui'
import { date, dateInput, decimal, hours, money, percent } from '@/lib/format'

/**
 * The machines charged to this job, and what each of them costs it.
 *
 * The three parts are shown apart rather than added up front, because they
 * answer three different questions. The hire is what the machine costs to have.
 * The fuel and wear are what it costs to run, charged by the hours it actually
 * ran. Standby is what it costs standing in the rain, and that is the column
 * worth looking at twice.
 */

export interface EquipmentAssignmentRow {
  id: string
  equipmentItemId: string
  displayName: string
  itemName: string
  label: string | null
  category: string | null
  ownership: string
  basis: string
  units: number
  operatingHours: number
  standbyHours: number
  startDate: string | null
  endDate: string | null
  rateOverride: number | null
  rate: number
  rateSource: string
  rentalCost: number
  operatingCost: number
  standbyCost: number
  cost: number
  equivalentHours: number
  workingOut: string
  costCodeId: string | null
  costCodeLabel: string | null
  itemActive: boolean
  notes: string | null
  issues: string[]
}

export interface EquipmentOption {
  id: string
  name: string
  ownership: string
  quotedBases: string[]
  loadedHourlyCost: number
  active: boolean
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const BASES: [string, string][] = [
  ['HOURLY', 'By the hour'],
  ['DAILY', 'By the day'],
  ['WEEKLY', 'By the week'],
  ['MONTHLY', 'By the month'],
]

const BASIS_UNITS: Record<string, string> = {
  HOURLY: 'hours',
  DAILY: 'days',
  WEEKLY: 'weeks',
  MONTHLY: 'months',
}

export function EquipmentAssignments({
  projectId,
  rows,
  totals,
  byOwnership,
  standbyShare,
  issues,
  equipment,
  costCodes,
  canEdit,
  save,
  remove,
}: {
  projectId: string
  rows: EquipmentAssignmentRow[]
  totals: {
    rentalCost: number
    operatingCost: number
    standbyCost: number
    cost: number
    operatingHours: number
    standbyHours: number
  }
  byOwnership: { ownership: string; label: string; cost: number }[]
  standbyShare: number
  issues: string[]
  equipment: EquipmentOption[]
  costCodes: { id: string; label: string }[]
  canEdit: boolean
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

  if (equipment.length === 0) {
    return (
      <EmptyState
        icon="◦"
        title="No equipment on the list yet"
        description="What each machine costs an hour, a day, a week and a month lives in Settings, under equipment and rates. Add the plant once and every job can draw on it."
      />
    )
  }

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
          title="No plant charged to this job yet"
          description="Add each machine with how long it is on for, the hours it actually ran, and the hours it stood idle."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Charge a machine to this job
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
                  <th>Machine</th>
                  <th>Charged to</th>
                  <th>On for</th>
                  <th className="num">Rate</th>
                  <th className="num">Hire</th>
                  <th className="num">Ran</th>
                  <th className="num">Fuel and wear</th>
                  <th className="num">Standby</th>
                  <th className="num">Cost to this job</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editing === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={canEdit ? 10 : 9} className="top">
                        <AssignmentForm
                          projectId={projectId}
                          row={row}
                          equipment={equipment}
                          costCodes={costCodes}
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
                      <td>
                        <span className="font-medium">{row.displayName}</span>
                        {row.label && (
                          <span className="ml-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                            {row.itemName}
                          </span>
                        )}
                        {!row.itemActive && (
                          <span className="ml-1.5 pill" style={{ background: 'var(--caution-soft)', color: 'var(--caution)' }}>
                            Out of use
                          </span>
                        )}
                        {row.issues.length > 0 && (
                          <div className="wrap mt-0.5 text-[11px]" style={{ color: 'var(--adverse)' }}>
                            {row.issues.join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.costCodeLabel ?? <span style={{ color: 'var(--adverse)' }}>No cost code</span>}
                      </td>
                      <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                        {decimal(row.units, 2)} {BASIS_UNITS[row.basis] ?? ''}
                        {row.startDate && row.endDate && (
                          <div style={{ color: 'var(--text-subtle)' }}>
                            {date(row.startDate)} to {date(row.endDate)}
                          </div>
                        )}
                      </td>
                      <td className="num" title={row.rateSource}>
                        {money(row.rate, { cents: true })}
                        {row.rateOverride != null && (
                          <span className="ml-1 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                            job rate
                          </span>
                        )}
                      </td>
                      <td className="num">{money(row.rentalCost)}</td>
                      <td className="num">{hours(row.operatingHours)} h</td>
                      <td className="num">{money(row.operatingCost)}</td>
                      <td className="num" style={{ color: row.standbyCost > 0 ? 'var(--caution)' : undefined }}>
                        {money(row.standbyCost)}
                      </td>
                      <td className="num font-semibold">
                        <Calculated formula={row.workingOut}>{money(row.cost)}</Calculated>
                      </td>
                      {canEdit && (
                        <td className="no-print">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                              Edit
                            </button>
                            <ConfirmButton
                              label="Remove"
                              confirmLabel="Take it off the job"
                              title={`Remove ${row.displayName}`}
                              description="The removal is recorded permanently in the audit history."
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
                {byOwnership.map((group) => (
                  <tr key={group.ownership}>
                    <td colSpan={8} style={{ color: 'var(--text-muted)' }}>
                      {group.label}
                    </td>
                    <td className="num">{money(group.cost)}</td>
                    {canEdit && <td className="no-print" />}
                  </tr>
                ))}
                <tr>
                  <th colSpan={4}>All plant on this job</th>
                  <th className="num">{money(totals.rentalCost)}</th>
                  <th className="num">{hours(totals.operatingHours)} h</th>
                  <th className="num">{money(totals.operatingCost)}</th>
                  <th className="num">{money(totals.standbyCost)}</th>
                  <th className="num">{money(totals.cost)}</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && totals.standbyCost > 0 && (
        <p className="text-xs" style={{ color: 'var(--caution)' }}>
          {money(totals.standbyCost)} of this is standby, {percent(standbyShare, 1)} of what the plant is costing the
          job, over {hours(totals.standbyHours)} idle hours.
        </p>
      )}

      {issues.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)' }}
        >
          <ul className="space-y-0.5 text-xs" style={{ color: 'var(--caution)' }}>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {adding && canEdit && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
          <AssignmentForm
            projectId={projectId}
            equipment={equipment}
            costCodes={costCodes}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSubmit={async (formData) => {
              if (await run(save, formData)) setAdding(false)
            }}
          />
        </div>
      )}

      {canEdit && !adding && rows.length > 0 && (
        <div className="no-print">
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setAdding(true)}>
            Charge another machine
          </button>
        </div>
      )}
    </div>
  )
}

function AssignmentForm({
  projectId,
  row,
  equipment,
  costCodes,
  busy,
  onSubmit,
  onCancel,
}: {
  projectId: string
  row?: EquipmentAssignmentRow
  equipment: EquipmentOption[]
  costCodes: { id: string; label: string }[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [equipmentItemId, setEquipmentItemId] = useState(row?.equipmentItemId ?? equipment[0]?.id ?? '')
  const chosen = equipment.find((item) => item.id === equipmentItemId)

  // Open on a basis the machine is actually quoted at, so the common case does
  // not start on one that would price at nothing.
  const [basis, setBasis] = useState(row?.basis ?? chosen?.quotedBases[0] ?? 'DAILY')

  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Machine
          </span>
          <select
            name="equipmentItemId"
            value={equipmentItemId}
            onChange={(event) => {
              setEquipmentItemId(event.target.value)
              const next = equipment.find((item) => item.id === event.target.value)
              if (next?.quotedBases[0]) setBasis(next.quotedBases[0])
            }}
            required
            className="field mt-1 w-full text-sm"
          >
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? '' : ' (out of use)'}
              </option>
            ))}
          </select>
          {chosen && (
            <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {chosen.quotedBases.length > 0
                ? `Quoted ${chosen.quotedBases.map((entry) => entry.toLowerCase()).join(', ')}`
                : 'No rate at any basis yet'}
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Which one
          </span>
          <input
            name="label"
            defaultValue={row?.label ?? ''}
            placeholder="Optional, when the fleet has several"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Charged to
          </span>
          <select name="costCodeId" defaultValue={row?.costCodeId ?? ''} className="field mt-1 w-full text-sm">
            <option value="">Not set</option>
            {costCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Charged
          </span>
          <select
            name="basis"
            value={basis}
            onChange={(event) => setBasis(event.target.value)}
            className="field mt-1 w-full text-sm"
          >
            {BASES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
                {chosen && !chosen.quotedBases.includes(value) ? ' (no rate)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            How many {BASIS_UNITS[basis] ?? 'units'}
          </span>
          <input name="units" defaultValue={row ? String(row.units) : ''} required className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Hours it actually ran
          </span>
          <input
            name="operatingHours"
            defaultValue={row ? String(row.operatingHours) : '0'}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Fuel and wear are charged on these, not on the hire.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Hours it stood idle
          </span>
          <input
            name="standbyHours"
            defaultValue={row ? String(row.standbyHours) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Rate for this job
          </span>
          <input
            name="rateOverride"
            defaultValue={row?.rateOverride != null ? String(row.rateOverride) : ''}
            placeholder="Leave empty to use the list"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            On site from
          </span>
          <input
            type="date"
            name="startDate"
            defaultValue={row?.startDate ? dateInput(row.startDate) : ''}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            On site to
          </span>
          <input
            type="date"
            name="endDate"
            defaultValue={row?.endDate ? dateInput(row.endDate) : ''}
            className="field mt-1 w-full text-sm"
          />
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
          {row ? 'Save entry' : 'Charge it to the job'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
