'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Calculated, EmptyState, Pill } from '@/components/ui'
import { money, number as fmtNumber } from '@/lib/format'

/**
 * What each machine costs, entered once.
 *
 * Rates are held at every basis they are quoted at rather than one being
 * converted into the others behind the scenes, because a weekly rate is almost
 * never five daily rates and pretending otherwise loses money on long hires.
 * The hourly figure the table shows is worked down from the shortest basis
 * that has a rate, and the row says which one it came from.
 */

export interface EquipmentRow {
  id: string
  code: string | null
  name: string
  category: string | null
  ownership: 'OWNED' | 'RENTED' | 'OPERATOR_PROVIDED'
  hourlyRate: number
  dailyRate: number
  weeklyRate: number
  monthlyRate: number
  operatingCostPerHour: number
  standbyRatePerHour: number
  hoursPerDay: number
  daysPerWeek: number
  vendorId: string | null
  vendorName: string | null
  assetTag: string | null
  costCategory: string
  notes: string | null
  active: boolean
  assignmentCount: number
  effectiveHourlyRate: number
  hourlyRateSource: string | null
  loadedHourlyCost: number
  quotedBases: string[]
  issues: string[]
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const OWNERSHIPS: [string, string][] = [
  ['OWNED', 'Owned'],
  ['RENTED', 'Rented'],
  ['OPERATOR_PROVIDED', 'Operator provided'],
]

const COST_CATEGORIES: [string, string][] = [
  ['EQUIPMENT', 'Equipment'],
  ['GENERAL_CONDITIONS', 'General conditions'],
  ['OVERHEAD', 'Overhead'],
  ['OTHER', 'Other'],
]

export function EquipmentLibrary({
  rows,
  vendors,
  canEdit,
  save,
  remove,
}: {
  rows: EquipmentRow[]
  vendors: { id: string; label: string }[]
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
          title="No equipment on the list yet"
          description="Add each machine with the rates it is quoted at, the fuel and wear it burns an hour, and what it costs standing idle. Estimates, change orders, time and materials tickets and project budgets all price from them."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Add the first machine
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
                  <th>Ownership</th>
                  <th className="num">Hourly</th>
                  <th className="num">Daily</th>
                  <th className="num">Weekly</th>
                  <th className="num">Monthly</th>
                  <th className="num">Fuel and wear an hour</th>
                  <th className="num">Standby an hour</th>
                  <th className="num">An hour, all in</th>
                  <th className="num">On jobs</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editing === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={canEdit ? 11 : 10} className="top">
                        <EquipmentForm
                          row={row}
                          vendors={vendors}
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
                        <span className="font-medium">{row.name}</span>
                        {row.category && (
                          <span className="ml-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                            {row.category}
                          </span>
                        )}
                        {!row.active && (
                          <span className="ml-1.5 pill" style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}>
                            Out of use
                          </span>
                        )}
                        {row.issues.length > 0 && (
                          <div className="wrap mt-0.5 text-[11px]" style={{ color: 'var(--caution)' }}>
                            {row.issues.join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {OWNERSHIPS.find(([value]) => value === row.ownership)?.[1] ?? row.ownership}
                        {row.vendorName && (
                          <div style={{ color: 'var(--text-subtle)' }}>{row.vendorName}</div>
                        )}
                      </td>
                      <td className="num">{row.hourlyRate ? money(row.hourlyRate, { cents: true }) : '-'}</td>
                      <td className="num">{row.dailyRate ? money(row.dailyRate) : '-'}</td>
                      <td className="num">{row.weeklyRate ? money(row.weeklyRate) : '-'}</td>
                      <td className="num">{row.monthlyRate ? money(row.monthlyRate) : '-'}</td>
                      <td className="num">{money(row.operatingCostPerHour, { cents: true })}</td>
                      <td className="num">{money(row.standbyRatePerHour, { cents: true })}</td>
                      <td
                        className="num font-semibold"
                        title={
                          row.hourlyRateSource === 'HOURLY'
                            ? 'From the hourly rate, plus fuel and wear'
                            : `Worked down from the ${String(row.hourlyRateSource ?? '').toLowerCase()} rate over ${row.hoursPerDay} hour days, plus fuel and wear`
                        }
                      >
                        <Calculated formula="rate an hour + fuel and wear">
                          {money(row.loadedHourlyCost, { cents: true })}
                        </Calculated>
                      </td>
                      <td className="num">{fmtNumber(row.assignmentCount, 0)}</td>
                      {canEdit && (
                        <td className="no-print">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                              Edit
                            </button>
                            <ConfirmButton
                              label="Delete"
                              confirmLabel="Delete the machine"
                              title={`Delete ${row.name}`}
                              description={
                                row.assignmentCount > 0
                                  ? `${row.name} is charged to ${row.assignmentCount} jobs, so it cannot be deleted. Mark it out of use instead.`
                                  : 'The deletion is recorded permanently in the audit history.'
                              }
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
            </table>
          </div>
        </div>
      )}

      {adding && canEdit && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
          <EquipmentForm
            vendors={vendors}
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
            Add a machine
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rows
            .filter((row) => row.quotedBases.length === 0)
            .map((row) => (
              <Pill key={row.id} tone="caution">
                {row.name} has no rate at any basis
              </Pill>
            ))}
        </div>
      )}
    </div>
  )
}

function EquipmentForm({
  row,
  vendors,
  busy,
  onSubmit,
  onCancel,
}: {
  row?: EquipmentRow
  vendors: { id: string; label: string }[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [ownership, setOwnership] = useState(row?.ownership ?? 'OWNED')

  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Machine
          </span>
          <input
            name="name"
            defaultValue={row?.name ?? ''}
            required
            placeholder="Excavator, 30 tonne"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Kind
          </span>
          <input
            name="category"
            defaultValue={row?.category ?? ''}
            placeholder="Earthmoving, trucks, compaction"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Ownership
          </span>
          <select
            name="ownership"
            value={ownership}
            onChange={(event) => setOwnership(event.target.value as EquipmentRow['ownership'])}
            className="field mt-1 w-full text-sm"
          >
            {OWNERSHIPS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Code
          </span>
          <input name="code" defaultValue={row?.code ?? ''} className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Asset tag
          </span>
          <input name="assetTag" defaultValue={row?.assetTag ?? ''} className="field mt-1 w-full text-sm" />
        </label>

        {ownership === 'RENTED' && (
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Hired from
            </span>
            <select name="vendorId" defaultValue={row?.vendorId ?? ''} className="field mt-1 w-full text-sm">
              <option value="">Not set</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Cost type
          </span>
          <select name="costCategory" defaultValue={row?.costCategory ?? 'EQUIPMENT'} className="field mt-1 w-full text-sm">
            {COST_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
        <legend className="px-1 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Rates
        </legend>
        <p className="mb-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
          Enter each basis the machine is actually quoted at. Leave a basis empty rather than working it out from
          another one: a week is almost never five days, and a job charged the wrong way round loses the difference.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ['hourlyRate', 'Hourly'],
              ['dailyRate', 'Daily'],
              ['weeklyRate', 'Weekly'],
              ['monthlyRate', 'Monthly'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {label}
              </span>
              <input name={key} defaultValue={row ? String(row[key]) : '0'} className="field mt-1 w-full text-sm" />
            </label>
          ))}
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Fuel and wear an hour
            </span>
            <input
              name="operatingCostPerHour"
              defaultValue={row ? String(row.operatingCostPerHour) : '0'}
              className="field mt-1 w-full text-sm"
            />
            <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              Charged per hour it actually runs.
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Standby an hour
            </span>
            <input
              name="standbyRatePerHour"
              defaultValue={row ? String(row.standbyRatePerHour) : '0'}
              className="field mt-1 w-full text-sm"
            />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Hours in a working day
            </span>
            <input name="hoursPerDay" defaultValue={row ? String(row.hoursPerDay) : '8'} className="field mt-1 w-full text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Days in a working week
            </span>
            <input name="daysPerWeek" defaultValue={row ? String(row.daysPerWeek) : '5'} className="field mt-1 w-full text-sm" />
          </label>
          <p className="col-span-2 self-end text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Used to work a daily or weekly rate down to an hour for a line that runs the machine by the hour. A haul
            truck on two shifts is not an eight hour day, so it is recorded rather than assumed.
          </p>
        </div>
      </fieldset>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <input name="notes" defaultValue={row?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" name="active" defaultChecked={row ? row.active : true} />
          Offer this machine when pricing and assigning
        </label>
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save machine' : 'Add it'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
