'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { EmptyState, Pill } from '@/components/ui'
import { date, dateInput } from '@/lib/format'

/**
 * What this job has to file, when it is next due, and what has been filed.
 *
 * The schedule is not stored. Every deadline is counted forward from the first
 * one at the stated frequency, and what has been filed is matched against it,
 * so a filing made late does not shift what comes after it and a gap in the
 * middle stays visible as a gap.
 */

export type ComplianceStatus = 'CURRENT' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'CLOSED'

export interface ComplianceRow {
  id: string
  kind: string
  title: string
  agency: string | null
  frequency: string
  frequencyLabel: string
  firstDueDate: string
  endsOn: string | null
  leadDays: number
  responsibleUserId: string | null
  responsibleName: string | null
  notes: string | null
  active: boolean
  status: ComplianceStatus
  summary: string
  nextDueDate: string | null
  daysUntilDue: number | null
  missedCount: number
  deadlinesToDate: number
  submissionCount: number
  lastSubmittedAt: string | null
  submissions: {
    id: string
    dueDate: string
    periodEnd: string | null
    submittedAt: string
    submittedByName: string | null
    reference: string | null
  }[]
}

export interface PersonOption {
  id: string
  name: string
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const KIND_LABELS: Record<string, string> = {
  CERTIFIED_PAYROLL: 'Certified payroll',
  PREVAILING_WAGE_POSTING: 'Prevailing wage posting',
  FRINGE_BENEFIT_STATEMENT: 'Fringe benefit statement',
  APPRENTICESHIP_UTILIZATION: 'Apprenticeship utilisation',
  EEO_REPORT: 'Equal opportunity report',
  WAGE_DETERMINATION_UPDATE: 'Wage determination update',
  INTENT_OR_AFFIDAVIT: 'Intent or affidavit',
  OSHA_LOG: 'Injury and illness log',
  INSURANCE_CERTIFICATE: 'Certificate of insurance',
  LICENSE_OR_REGISTRATION: 'Licence or registration',
  OTHER: 'Other',
}

const FREQUENCY_OPTIONS: [string, string][] = [
  ['WEEKLY', 'Weekly'],
  ['BIWEEKLY', 'Every two weeks'],
  ['SEMIMONTHLY', 'Twice a month'],
  ['MONTHLY', 'Monthly'],
  ['QUARTERLY', 'Quarterly'],
  ['ANNUAL', 'Annually'],
  ['ONE_TIME', 'Once'],
]

const STATUS_TONE: Record<ComplianceStatus, 'favorable' | 'caution' | 'adverse' | 'neutral'> = {
  CURRENT: 'favorable',
  DUE_SOON: 'caution',
  DUE_TODAY: 'caution',
  OVERDUE: 'adverse',
  CLOSED: 'neutral',
}

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  CURRENT: 'Up to date',
  DUE_SOON: 'Due soon',
  DUE_TODAY: 'Due today',
  OVERDUE: 'Overdue',
  CLOSED: 'Nothing outstanding',
}

export function ComplianceList({
  projectId,
  rows,
  people,
  canEdit,
  save,
  remove,
  record,
  withdraw,
}: {
  projectId: string
  rows: ComplianceRow[]
  people: PersonOption[]
  canEdit: boolean
  save: Action
  remove: Action
  record: Action
  withdraw: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [filing, setFiling] = useState<string | null>(null)
  const [showingHistory, setShowingHistory] = useState<string | null>(null)

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
          title="Nothing recorded that this job has to file"
          description="Public work usually owes certified payroll most weeks, an apprenticeship report most months, and a wage determination checked each quarter. Record them here and they will show on the project alerts and the dashboard before they fall due."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Add a requirement
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) =>
            editing === row.id ? (
              <div key={row.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
                <RequirementForm
                  projectId={projectId}
                  row={row}
                  people={people}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (formData) => {
                    if (await run(save, formData)) setEditing(null)
                  }}
                />
              </div>
            ) : (
              <div key={row.id} className="card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                        {row.title}
                      </h3>
                      <Pill tone={STATUS_TONE[row.status]} dot>
                        {STATUS_LABEL[row.status]}
                      </Pill>
                      {!row.active && <Pill tone="neutral">No longer required</Pill>}
                    </div>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {KIND_LABELS[row.kind] ?? row.kind} · {row.frequencyLabel}
                      {row.agency ? ` · ${row.agency}` : ''}
                      {row.nextDueDate ? ` · Next due ${date(row.nextDueDate)}` : ''}
                    </p>
                    <p
                      className="mt-0.5 text-xs"
                      style={{
                        color:
                          row.status === 'OVERDUE'
                            ? 'var(--adverse)'
                            : row.status === 'DUE_SOON' || row.status === 'DUE_TODAY'
                              ? 'var(--caution)'
                              : 'var(--text-subtle)',
                      }}
                    >
                      {row.summary}
                    </p>
                    {row.deadlinesToDate > 0 && (
                      <p className="mt-0.5 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                        {row.deadlinesToDate - row.missedCount} of {row.deadlinesToDate} deadlines answered
                        {row.lastSubmittedAt ? `, last filed ${date(row.lastSubmittedAt)}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {row.submissionCount > 0 && (
                      <button
                        type="button"
                        className="btn btn-ghost text-xs"
                        onClick={() => setShowingHistory(showingHistory === row.id ? null : row.id)}
                      >
                        {row.submissionCount} filed
                      </button>
                    )}
                    {canEdit && row.nextDueDate && (
                      <button type="button" className="btn btn-primary text-xs" onClick={() => setFiling(row.id)}>
                        Record a filing
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                          Edit
                        </button>
                        <ConfirmButton
                          label="Delete"
                          confirmLabel="Delete requirement"
                          title={`Delete ${row.title}`}
                          description={
                            row.submissionCount > 0
                              ? 'This requirement has filings recorded against it, so it cannot be deleted. Mark it no longer required instead.'
                              : 'The deletion is recorded permanently in the audit history.'
                          }
                          onConfirm={async () => {
                            const formData = new FormData()
                            formData.set('id', row.id)
                            await run(remove, formData)
                          }}
                        />
                      </>
                    )}
                  </div>
                </div>

                {filing === row.id && canEdit && (
                  <form
                    action={async (formData) => {
                      if (await run(record, formData)) setFiling(null)
                    }}
                    className="mt-3 rounded-lg border p-3"
                    style={{ borderColor: 'var(--border-strong)' }}
                  >
                    <input type="hidden" name="requirementId" value={row.id} />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="block">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                          Deadline this answers
                        </span>
                        <input
                          type="date"
                          name="dueDate"
                          defaultValue={row.nextDueDate ? dateInput(row.nextDueDate) : ''}
                          required
                          className="field mt-1 w-full text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                          Filed on
                        </span>
                        <input type="date" name="submittedAt" className="field mt-1 w-full text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                          Period covered to
                        </span>
                        <input type="date" name="periodEnd" className="field mt-1 w-full text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                          Reference
                        </span>
                        <input
                          name="reference"
                          placeholder="Confirmation number or file name"
                          className="field mt-1 w-full text-sm"
                        />
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                        Record it
                      </button>
                      <button type="button" className="btn btn-ghost text-xs" onClick={() => setFiling(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {showingHistory === row.id && row.submissions.length > 0 && (
                  <div className="mt-3 table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Deadline</th>
                          <th>Filed</th>
                          <th>By</th>
                          <th>Reference</th>
                          {canEdit && <th className="no-print" />}
                        </tr>
                      </thead>
                      <tbody>
                        {row.submissions.map((submission) => {
                          const late =
                            new Date(submission.submittedAt).getTime() > new Date(submission.dueDate).getTime()
                          return (
                            <tr key={submission.id}>
                              <td>{date(submission.dueDate)}</td>
                              <td style={{ color: late ? 'var(--caution)' : 'var(--text)' }}>
                                {date(submission.submittedAt)}
                                {late ? ' (late)' : ''}
                              </td>
                              <td>{submission.submittedByName ?? 'Not recorded'}</td>
                              <td className="wrap">{submission.reference ?? ''}</td>
                              {canEdit && (
                                <td className="no-print">
                                  <ConfirmButton
                                    label="Withdraw"
                                    confirmLabel="Withdraw the filing"
                                    title={`Withdraw the filing for ${date(submission.dueDate)}`}
                                    description="That deadline becomes outstanding again. The withdrawal is recorded permanently in the audit history."
                                    onConfirm={async () => {
                                      const formData = new FormData()
                                      formData.set('id', submission.id)
                                      await run(withdraw, formData)
                                    }}
                                  />
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}

      {adding && canEdit && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
          <RequirementForm
            projectId={projectId}
            people={people}
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
            Add a requirement
          </button>
        </div>
      )}
    </div>
  )
}

function RequirementForm({
  projectId,
  row,
  people,
  busy,
  onSubmit,
  onCancel,
}: {
  projectId: string
  row?: ComplianceRow
  people: PersonOption[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Title
          </span>
          <input
            name="title"
            defaultValue={row?.title ?? ''}
            required
            placeholder="Certified payroll"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Kind
          </span>
          <select name="kind" defaultValue={row?.kind ?? 'CERTIFIED_PAYROLL'} className="field mt-1 w-full text-sm">
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Filed with
          </span>
          <input
            name="agency"
            defaultValue={row?.agency ?? ''}
            placeholder="The awarding body or agency"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            How often
          </span>
          <select name="frequency" defaultValue={row?.frequency ?? 'WEEKLY'} className="field mt-1 w-full text-sm">
            {FREQUENCY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            First deadline
          </span>
          <input
            type="date"
            name="firstDueDate"
            defaultValue={row?.firstDueDate ? dateInput(row.firstDueDate) : ''}
            required
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Every later deadline is counted forward from this one.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Stops being due
          </span>
          <input
            type="date"
            name="endsOn"
            defaultValue={row?.endsOn ? dateInput(row.endsOn) : ''}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Warn this many days ahead
          </span>
          <input name="leadDays" defaultValue={row ? String(row.leadDays) : '7'} className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Responsible
          </span>
          <select
            name="responsibleUserId"
            defaultValue={row?.responsibleUserId ?? ''}
            className="field mt-1 w-full text-sm"
          >
            <option value="">Nobody named</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <input name="notes" defaultValue={row?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" name="active" defaultChecked={row ? row.active : true} />
          Still required on this job
        </label>
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save requirement' : 'Add the requirement'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
