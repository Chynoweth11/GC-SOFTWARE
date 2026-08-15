'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Calculated, EmptyState } from '@/components/ui'
import { date, dateInput, hours, money, percent } from '@/lib/format'

/**
 * Who is charged to this job, and what they cost it.
 *
 * Two ways to say it, because two things are being said. Craft labor and short
 * stints are a number of hours. A salaried manager is a share of somebody's
 * time across a range of dates, which is how a project team is actually
 * staffed: half a project manager from March to November, a superintendent for
 * the duration, an estimator for the three weeks of the bid.
 *
 * Every figure in the cost column is worked out on the way to the screen from
 * the classification's loaded rate, so a pay rise entered once reprices every
 * job that person is on instead of leaving a trail of stale numbers.
 */

export interface AssignmentRow {
  id: string
  displayName: string
  className: string
  classificationId: string
  label: string | null
  kind: 'FIELD' | 'STAFF'
  basis: 'HOURS' | 'ALLOCATION'
  budgetedHours: number
  allocationPct: number
  startDate: string | null
  endDate: string | null
  loadedRateOverride: number | null
  loadedHourlyCost: number
  weeks: number
  hours: number
  cost: number
  workingOut: string
  costCodeId: string | null
  costCodeLabel: string | null
  classificationActive: boolean
  notes: string | null
  issues: string[]
}

export interface ClassificationOption {
  id: string
  name: string
  kind: 'FIELD' | 'STAFF'
  payBasis: 'HOURLY' | 'SALARY'
  loadedHourlyCost: number
  active: boolean
}

export interface CostCodeOption {
  id: string
  label: string
}

type Action = (formData: FormData) => Promise<{ error?: string }>

export function LaborAssignments({
  projectId,
  rows,
  totals,
  byKind,
  issues,
  classifications,
  costCodes,
  canEdit,
  save,
  remove,
}: {
  projectId: string
  rows: AssignmentRow[]
  totals: { hours: number; cost: number }
  byKind: { kind: 'FIELD' | 'STAFF'; label: string; hours: number; cost: number }[]
  issues: string[]
  classifications: ClassificationOption[]
  costCodes: CostCodeOption[]
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

  if (classifications.length === 0) {
    return (
      <EmptyState
        icon="◦"
        title="No classifications to assign yet"
        description="The library of what each classification costs an hour lives in Settings, under labor rates and overhead. Add the wages and salaries there once and every job can draw on them."
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
          title="Nobody is charged to this job yet"
          description="Assign the project team and the field labor this job carries. Salaried people go on as a share of their time across a range of dates; craft labor and short stints go on as hours."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Assign somebody
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
                  <th>Who</th>
                  <th>Charged to</th>
                  <th>How it is measured</th>
                  <th className="num">Loaded rate</th>
                  <th className="num">Hours</th>
                  <th className="num">Cost to this job</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editing === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={canEdit ? 7 : 6} className="top">
                        <AssignmentForm
                          projectId={projectId}
                          row={row}
                          classifications={classifications}
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
                            {row.className}
                          </span>
                        )}
                        {!row.classificationActive && (
                          <span className="ml-1.5 pill" style={{ background: 'var(--caution-soft)', color: 'var(--caution)' }}>
                            Classification out of use
                          </span>
                        )}
                        {row.issues.length > 0 && (
                          <div className="wrap mt-0.5 text-[11px]" style={{ color: 'var(--adverse)' }}>
                            {row.issues.join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.costCodeLabel ?? (
                          <span style={{ color: 'var(--adverse)' }}>No cost code</span>
                        )}
                      </td>
                      <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                        {row.basis === 'ALLOCATION' ? (
                          <>
                            {percent(row.allocationPct)} from {date(row.startDate)} to {date(row.endDate)}
                            <span className="ml-1" style={{ color: 'var(--text-subtle)' }}>
                              {row.weeks.toFixed(1)} weeks
                            </span>
                          </>
                        ) : (
                          <>{hours(row.budgetedHours)} hours</>
                        )}
                      </td>
                      <td className="num" title={row.loadedRateOverride != null ? 'A rate agreed for this job' : 'From the classification library'}>
                        {money(row.loadedHourlyCost, { cents: true })}
                        {row.loadedRateOverride != null && (
                          <span className="ml-1 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                            job rate
                          </span>
                        )}
                      </td>
                      <td className="num">{hours(row.hours)}</td>
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
                              confirmLabel="Remove from the job"
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
              {rows.length > 0 && (
                <tfoot>
                  {byKind.map((group) => (
                    <tr key={group.kind}>
                      <td colSpan={4} style={{ color: 'var(--text-muted)' }}>
                        {group.label}
                      </td>
                      <td className="num">{hours(group.hours)}</td>
                      <td className="num">{money(group.cost)}</td>
                      {canEdit && <td className="no-print" />}
                    </tr>
                  ))}
                  <tr>
                    <th colSpan={4}>Everybody on this job</th>
                    <th className="num">{hours(totals.hours)}</th>
                    <th className="num">{money(totals.cost)}</th>
                    {canEdit && <th className="no-print" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
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
            classifications={classifications}
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
            Assign somebody else
          </button>
        </div>
      )}
    </div>
  )
}

function AssignmentForm({
  projectId,
  row,
  classifications,
  costCodes,
  busy,
  onSubmit,
  onCancel,
}: {
  projectId: string
  row?: AssignmentRow
  classifications: ClassificationOption[]
  costCodes: CostCodeOption[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [classificationId, setClassificationId] = useState(
    row?.classificationId ?? classifications[0]?.id ?? '',
  )
  const chosen = classifications.find((entry) => entry.id === classificationId)

  // A salary is naturally a share of somebody's time; an hourly class is
  // naturally a number of hours. The form opens on whichever fits and lets it
  // be changed, rather than making the choice twice.
  const [basis, setBasis] = useState<'HOURS' | 'ALLOCATION'>(
    row?.basis ?? (chosen?.payBasis === 'SALARY' ? 'ALLOCATION' : 'HOURS'),
  )

  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Classification
          </span>
          <select
            name="classificationId"
            value={classificationId}
            onChange={(event) => {
              setClassificationId(event.target.value)
              const next = classifications.find((entry) => entry.id === event.target.value)
              if (next) setBasis(next.payBasis === 'SALARY' ? 'ALLOCATION' : 'HOURS')
            }}
            required
            className="field mt-1 w-full text-sm"
          >
            {classifications.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.active ? '' : ' (out of use)'}
              </option>
            ))}
          </select>
          {chosen && (
            <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              {money(chosen.loadedHourlyCost, { cents: true })} an hour, fully loaded
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Person
          </span>
          <input
            name="label"
            defaultValue={row?.label ?? ''}
            placeholder="Optional, when it is a named person"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Charged to
          </span>
          <select name="costCodeId" defaultValue={row?.costCodeId ?? ''} className="field mt-1 w-full text-sm">
            <option value="">Not set</option>
            {costCodes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Measured as
          </span>
          <select
            name="basis"
            value={basis}
            onChange={(event) => setBasis(event.target.value as 'HOURS' | 'ALLOCATION')}
            className="field mt-1 w-full text-sm"
          >
            <option value="ALLOCATION">A share of their time over a range of dates</option>
            <option value="HOURS">A number of hours</option>
          </select>
        </label>
      </div>

      {basis === 'ALLOCATION' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Share of their time
            </span>
            <input
              name="allocationPct"
              defaultValue={row ? String(Math.round(row.allocationPct * 100)) : '100'}
              placeholder="Percent"
              className="field mt-1 w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              From
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
              To
            </span>
            <input
              type="date"
              name="endDate"
              defaultValue={row?.endDate ? dateInput(row.endDate) : ''}
              className="field mt-1 w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Rate for this job
            </span>
            <input
              name="loadedRateOverride"
              defaultValue={row?.loadedRateOverride != null ? String(row.loadedRateOverride) : ''}
              placeholder="Leave empty to use the library"
              className="field mt-1 w-full text-sm"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Hours
            </span>
            <input
              name="budgetedHours"
              defaultValue={row ? String(row.budgetedHours) : ''}
              className="field mt-1 w-full text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              Rate for this job
            </span>
            <input
              name="loadedRateOverride"
              defaultValue={row?.loadedRateOverride != null ? String(row.loadedRateOverride) : ''}
              placeholder="Leave empty to use the library"
              className="field mt-1 w-full text-sm"
            />
          </label>
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <input name="notes" defaultValue={row?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save assignment' : 'Add to the job'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
