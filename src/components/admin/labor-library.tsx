'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Calculated, EmptyState, Pill } from '@/components/ui'
import { money, number as fmtNumber, percent } from '@/lib/format'

/**
 * What each classification of person costs the company an hour, fully loaded.
 *
 * The single place a wage or a salary is entered. Estimates price takeoff labor
 * through it, project teams are assigned through it, and the overhead recovery
 * rate counts the staff nobody is paying for through it. A pay rise entered
 * here moves all three, because none of them holds a copy.
 *
 * Field labor and project team are shown apart because they behave differently:
 * a carpenter is on a job or is not employed, while a project manager who is
 * not on a job is overhead, and the second half of that sentence is what most
 * bid overhead percentages fail to carry.
 */

export interface ClassificationRow {
  id: string
  code: string | null
  name: string
  kind: 'FIELD' | 'STAFF'
  payBasis: 'HOURLY' | 'SALARY'
  baseAmount: number
  benefitsAmount: number
  annualHours: number
  trainingPerHour: number
  workersCompRate: number
  workersCompBasis: 'PER_HOUR' | 'PER_100_PAYROLL'
  jurisdictionId: string | null
  sutaSource: string
  costCategory: string
  tradeId: string | null
  notes: string | null
  active: boolean
  assignmentCount: number
  assignedShare: number
  hourlyWage: number
  hourlyBenefits: number
  hourlyBurden: number
  loadedHourlyCost: number
  loadedWeeklyCost: number
  loadedAnnualCost: number
  burdenPctOfWage: number
  issues: string[]
}

export interface Option {
  id: string
  label: string
}

type Action = (formData: FormData) => Promise<{ error?: string }>

const COST_CATEGORIES: [string, string][] = [
  ['LABOR', 'Labor'],
  ['GENERAL_CONDITIONS', 'General conditions'],
  ['OVERHEAD', 'Overhead'],
  ['EQUIPMENT', 'Equipment'],
  ['OTHER', 'Other'],
]

export function LaborLibrary({
  rows,
  jurisdictions,
  trades,
  canEdit,
  save,
  remove,
}: {
  rows: ClassificationRow[]
  jurisdictions: Option[]
  trades: Option[]
  canEdit: boolean
  save: Action
  remove: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState<'FIELD' | 'STAFF' | null>(null)

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

  const groups = useMemo(
    () =>
      (['FIELD', 'STAFF'] as const).map((kind) => ({
        kind,
        label: kind === 'FIELD' ? 'Field labor' : 'Project team and office',
        description:
          kind === 'FIELD'
            ? 'Craft classifications, priced into takeoff lines and charged to work codes'
            : 'Managers, superintendents, engineers, estimators and administration. Time on a job is charged to it; the rest is overhead.',
        rows: rows.filter((row) => row.kind === kind),
      })),
    [rows],
  )

  return (
    <div className="space-y-5">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {groups.map((group) => (
        <div key={group.kind}>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-muted)' }}>
                {group.label}
              </h3>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                {group.description}
              </p>
            </div>
            {canEdit && (
              <button type="button" className="btn btn-ghost text-xs" onClick={() => setAdding(group.kind)}>
                Add a classification
              </button>
            )}
          </div>

          {group.rows.length === 0 && adding !== group.kind ? (
            <EmptyState
              icon="◦"
              title={group.kind === 'FIELD' ? 'No craft classifications yet' : 'No salaried people yet'}
              description={
                group.kind === 'FIELD'
                  ? 'Add each craft classification with its wage, fringe and workers compensation rate. Estimates and project budgets price from them.'
                  : 'Add each salaried role with its salary, the cost of its benefits and the hours a year the salary is spread over. Whatever time a job does not carry becomes overhead.'
              }
              action={
                canEdit ? (
                  <button type="button" className="btn btn-primary" onClick={() => setAdding(group.kind)}>
                    Add one
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
                      <th>Classification</th>
                      <th>Paid</th>
                      <th className="num">Wage per hour</th>
                      <th className="num">Fringe per hour</th>
                      <th className="num">Burden</th>
                      <th className="num">Loaded hourly</th>
                      <th className="num">{group.kind === 'STAFF' ? 'Loaded annual' : 'Loaded weekly'}</th>
                      <th className="num">On jobs</th>
                      {canEdit && <th className="no-print" />}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) =>
                      editing === row.id ? (
                        <tr key={row.id}>
                          <td colSpan={canEdit ? 9 : 8} className="top">
                            <ClassificationForm
                              row={row}
                              kind={row.kind}
                              jurisdictions={jurisdictions}
                              trades={trades}
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
                          <td className="wrap text-xs" style={{ color: 'var(--text-muted)' }}>
                            {row.payBasis === 'SALARY' ? (
                              <>
                                {money(row.baseAmount)} a year over {fmtNumber(row.annualHours, 0)} hours
                              </>
                            ) : (
                              <>{money(row.baseAmount, { cents: true })} an hour</>
                            )}
                          </td>
                          <td className="num">{money(row.hourlyWage, { cents: true })}</td>
                          <td className="num">{money(row.hourlyBenefits, { cents: true })}</td>
                          <td className="num" title={`${percent(row.burdenPctOfWage)} of the wage. ${row.sutaSource}`}>
                            {money(row.hourlyBurden, { cents: true })}
                          </td>
                          <td className="num font-semibold">
                            <Calculated formula="wage + fringe + burden">
                              {money(row.loadedHourlyCost, { cents: true })}
                            </Calculated>
                          </td>
                          <td className="num">
                            {money(group.kind === 'STAFF' ? row.loadedAnnualCost : row.loadedWeeklyCost)}
                          </td>
                          <td className="num">
                            {row.kind === 'STAFF' ? (
                              <span
                                style={{
                                  color:
                                    row.assignedShare > 1.0001
                                      ? 'var(--adverse)'
                                      : row.assignedShare <= 0
                                        ? 'var(--caution)'
                                        : 'var(--text)',
                                }}
                              >
                                {percent(row.assignedShare, 0)}
                              </span>
                            ) : (
                              fmtNumber(row.assignmentCount, 0)
                            )}
                          </td>
                          {canEdit && (
                            <td className="no-print">
                              <div className="flex items-center justify-end gap-1">
                                <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                                  Edit
                                </button>
                                <ConfirmButton
                                  label="Delete"
                                  confirmLabel="Delete classification"
                                  title={`Delete ${row.name}`}
                                  description={
                                    row.assignmentCount > 0
                                      ? `${row.name} is used by ${row.assignmentCount} project assignments, so it cannot be deleted. Mark it out of use instead.`
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

          {adding === group.kind && canEdit && (
            <div className="mt-2 rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
              <ClassificationForm
                kind={group.kind}
                jurisdictions={jurisdictions}
                trades={trades}
                busy={busy}
                onCancel={() => setAdding(null)}
                onSubmit={async (formData) => {
                  if (await run(save, formData)) setAdding(null)
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ClassificationForm({
  row,
  kind,
  jurisdictions,
  trades,
  busy,
  onSubmit,
  onCancel,
}: {
  row?: ClassificationRow
  kind: 'FIELD' | 'STAFF'
  jurisdictions: Option[]
  trades: Option[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [payBasis, setPayBasis] = useState<'HOURLY' | 'SALARY'>(
    row?.payBasis ?? (kind === 'STAFF' ? 'SALARY' : 'HOURLY'),
  )
  const salaried = payBasis === 'SALARY'

  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input type="hidden" name="kind" value={row?.kind ?? kind} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Name
          </span>
          <input
            name="name"
            defaultValue={row?.name ?? ''}
            required
            placeholder={kind === 'STAFF' ? 'Project manager' : 'Carpenter, journey level'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Code
          </span>
          <input name="code" defaultValue={row?.code ?? ''} className="field mt-1 w-full text-sm" />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Paid
          </span>
          <select
            name="payBasis"
            value={payBasis}
            onChange={(event) => setPayBasis(event.target.value as 'HOURLY' | 'SALARY')}
            className="field mt-1 w-full text-sm"
          >
            <option value="HOURLY">By the hour</option>
            <option value="SALARY">A salary</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {salaried ? 'Annual salary' : 'Wage per hour'}
          </span>
          <input
            name="baseAmount"
            defaultValue={row ? String(row.baseAmount) : ''}
            required
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {salaried ? 'Benefits a year' : 'Fringe per hour'}
          </span>
          <input
            name="benefitsAmount"
            defaultValue={row ? String(row.benefitsAmount) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Hours a year
          </span>
          <input
            name="annualHours"
            defaultValue={row ? String(row.annualHours) : '2080'}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            {salaried
              ? 'What the salary is spread over. A superintendent who works 2400 hours costs less an hour than the same salary over 2080.'
              : 'Used for the annual figure only.'}
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Training per hour
          </span>
          <input
            name="trainingPerHour"
            defaultValue={row ? String(row.trainingPerHour) : '0'}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Workers compensation rate
          </span>
          <input
            name="workersCompRate"
            defaultValue={row ? String(row.workersCompRate) : '0'}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Quoted the way the state quotes it: per hour worked, or per 100 dollars of payroll.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            State
          </span>
          <select name="jurisdictionId" defaultValue={row?.jurisdictionId ?? ''} className="field mt-1 w-full text-sm">
            <option value="">Not chosen</option>
            {jurisdictions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Sets the state unemployment rate and how workers compensation is quoted.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Cost type
          </span>
          <select
            name="costCategory"
            defaultValue={row?.costCategory ?? (kind === 'STAFF' ? 'GENERAL_CONDITIONS' : 'LABOR')}
            className="field mt-1 w-full text-sm"
          >
            {COST_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Trade
          </span>
          <select name="tradeId" defaultValue={row?.tradeId ?? ''} className="field mt-1 w-full text-sm">
            <option value="">Not set</option>
            {trades.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
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
          Offer this classification when pricing and assigning
        </label>
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save classification' : 'Add it'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

// ── Overhead ──────────────────────────────────────────────────────────────

export interface OverheadRow {
  id: string
  name: string
  category: string
  amount: number
  period: 'MONTHLY' | 'ANNUAL' | 'ONE_TIME'
  annualAmount: number
  monthlyAmount: number
  notes: string | null
}

const OVERHEAD_CATEGORIES: [string, string][] = [
  ['OFFICE', 'Office and premises'],
  ['VEHICLES', 'Vehicles and fuel'],
  ['SOFTWARE', 'Software and technology'],
  ['INSURANCE', 'Insurance and bonding'],
  ['EQUIPMENT', 'Owned equipment'],
  ['PROFESSIONAL', 'Professional fees'],
  ['MARKETING', 'Marketing'],
  ['TRAINING', 'Training and licences'],
  ['OTHER', 'Other'],
]

const OVERHEAD_CATEGORY_LABELS = Object.fromEntries(OVERHEAD_CATEGORIES)

const PERIODS: [string, string][] = [
  ['MONTHLY', 'Every month'],
  ['ANNUAL', 'Every year'],
  ['ONE_TIME', 'Once'],
]

/**
 * The overhead cost list, and the recovery rate it works out to.
 *
 * A bid carries an overhead percentage, and on most jobs that number is a habit
 * rather than a measurement. This divides real annual overhead by real annual
 * revenue and says what the number should be, next to what is being charged,
 * with the difference stated in money a year. A gap of nine tenths of a percent
 * means nothing until it is shown as the six figures it is.
 */
export function OverheadLibrary({
  rows,
  summary,
  canEdit,
  canAdopt,
  save,
  remove,
  adopt,
}: {
  rows: OverheadRow[]
  summary: {
    annualNonPayroll: number
    annualUnassignedStaff: number
    annualOverhead: number
    monthlyOverhead: number
    annualRevenue: number
    revenueBasis: string
    derivedRate: number | null
    rateOnFile: number
    rateGap: number | null
    annualGap: number | null
    byCategory: { category: string; annualAmount: number; share: number }[]
    issues: string[]
    staff: {
      annualStaffCost: number
      annualAssigned: number
      annualUnassigned: number
      utilization: number
      unassigned: { id: string; name: string; annualCost: number }[]
      overAllocated: { id: string; name: string; share: number }[]
    }
  }
  canEdit: boolean
  canAdopt: boolean
  save: Action
  remove: Action
  adopt: Action
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

  const underRecovering = summary.rateGap !== null && summary.rateGap > 0.0005

  return (
    <div className="space-y-4">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="card p-4">
        <table className="data">
          <tbody>
            <tr>
              <td>Overhead costs listed</td>
              <td className="num">{money(summary.annualNonPayroll)}</td>
              <td className="wrap text-xs" style={{ color: 'var(--text-subtle)' }}>
                {rows.length} {rows.length === 1 ? 'item' : 'items'}, annualized
              </td>
            </tr>
            <tr>
              <td>Salaried time no job is paying for</td>
              <td className="num">{money(summary.annualUnassignedStaff)}</td>
              <td className="wrap text-xs" style={{ color: 'var(--text-subtle)' }}>
                {percent(summary.staff.utilization, 0)} of the staff bill is on jobs
              </td>
            </tr>
            <tr>
              <th>Annual overhead</th>
              <th className="num">{money(summary.annualOverhead)}</th>
              <th className="wrap text-xs font-normal" style={{ color: 'var(--text-subtle)' }}>
                {money(summary.monthlyOverhead)} a month
              </th>
            </tr>
            <tr>
              <td>Annual revenue</td>
              <td className="num">{money(summary.annualRevenue)}</td>
              <td className="wrap text-xs" style={{ color: 'var(--text-subtle)' }}>
                {summary.revenueBasis}
              </td>
            </tr>
            <tr>
              <th>Recovery rate this works out to</th>
              <th className="num">{summary.derivedRate === null ? 'Cannot be worked out' : percent(summary.derivedRate, 2)}</th>
              <th className="wrap text-xs font-normal" style={{ color: 'var(--text-subtle)' }}>
                Overhead over revenue
              </th>
            </tr>
            <tr>
              <td>Rate carried in bids today</td>
              <td className="num">{percent(summary.rateOnFile, 2)}</td>
              <td className="wrap text-xs" style={{ color: underRecovering ? 'var(--adverse)' : 'var(--text-subtle)' }}>
                {summary.rateGap === null
                  ? 'Nothing to compare it against yet'
                  : underRecovering
                    ? `Under-recovering by ${percent(summary.rateGap, 2)}, which is ${money(summary.annualGap ?? 0)} a year`
                    : 'At or above what the cost list works out to'}
              </td>
            </tr>
          </tbody>
        </table>

        {canAdopt && summary.derivedRate !== null && Math.abs(summary.rateGap ?? 0) > 0.0005 && (
          <form action={async (formData) => void (await run(adopt, formData))} className="mt-3">
            <input type="hidden" name="derivedRate" value={summary.derivedRate} />
            <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
              Carry {percent(summary.derivedRate, 2)} in bids from now on
            </button>
            <span className="ml-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              Changes the company default. Estimates already open keep the rate they were priced at.
            </span>
          </form>
        )}
      </div>

      {summary.issues.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)' }}
        >
          <ul className="space-y-0.5 text-xs" style={{ color: 'var(--caution)' }}>
            {summary.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {(summary.staff.unassigned.length > 0 || summary.staff.overAllocated.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {summary.staff.unassigned.map((person) => (
            <Pill key={person.id} tone="caution">
              {person.name} is on no job, {money(person.annualCost)} a year
            </Pill>
          ))}
          {summary.staff.overAllocated.map((person) => (
            <Pill key={person.id} tone="adverse">
              {person.name} is allocated {percent(person.share, 0)}
            </Pill>
          ))}
        </div>
      )}

      {rows.length === 0 && !adding ? (
        <EmptyState
          icon="◦"
          title="No overhead costs listed"
          description="Rent, trucks, software, insurance, professional fees: the costs of being in business that no single job pays for. List them and the recovery rate above is measured rather than guessed. Salaries are not entered here; they are already on the classification list above."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                Add a cost
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
                  <th>Cost</th>
                  <th>Kind</th>
                  <th>How often</th>
                  <th className="num">Amount</th>
                  <th className="num">A month</th>
                  <th className="num">A year</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) =>
                  editing === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={canEdit ? 7 : 6} className="top">
                        <OverheadForm
                          row={row}
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
                      <td className="font-medium">{row.name}</td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {OVERHEAD_CATEGORY_LABELS[row.category] ?? row.category}
                      </td>
                      <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {PERIODS.find(([value]) => value === row.period)?.[1] ?? row.period}
                      </td>
                      <td className="num">{money(row.amount)}</td>
                      <td className="num">{money(row.monthlyAmount)}</td>
                      <td className="num">{money(row.annualAmount)}</td>
                      {canEdit && (
                        <td className="no-print">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="btn btn-ghost text-xs" onClick={() => setEditing(row.id)}>
                              Edit
                            </button>
                            <ConfirmButton
                              label="Delete"
                              confirmLabel="Delete cost"
                              title={`Delete ${row.name}`}
                              description="The deletion is recorded permanently in the audit history."
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
                  <th colSpan={4}>Listed overhead</th>
                  <th className="num">{money(summary.annualNonPayroll / 12)}</th>
                  <th className="num">{money(summary.annualNonPayroll)}</th>
                  {canEdit && <th className="no-print" />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {adding && canEdit && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
          <OverheadForm
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
            Add a cost
          </button>
        </div>
      )}
    </div>
  )
}

function OverheadForm({
  row,
  busy,
  onSubmit,
  onCancel,
}: {
  row?: OverheadRow
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block lg:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Name
          </span>
          <input
            name="name"
            defaultValue={row?.name ?? ''}
            required
            placeholder="Office rent"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Kind
          </span>
          <select name="category" defaultValue={row?.category ?? 'OTHER'} className="field mt-1 w-full text-sm">
            {OVERHEAD_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            How often
          </span>
          <select name="period" defaultValue={row?.period ?? 'MONTHLY'} className="field mt-1 w-full text-sm">
            {PERIODS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Amount
          </span>
          <input
            name="amount"
            defaultValue={row ? String(row.amount) : ''}
            required
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Incurred on
          </span>
          <input type="date" name="incurredOn" className="field mt-1 w-full text-sm" />
        </label>

        <label className="block lg:col-span-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Notes
          </span>
          <input name="notes" defaultValue={row?.notes ?? ''} className="field mt-1 w-full text-sm" />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input type="checkbox" name="active" defaultChecked />
          Count this towards the overhead rate
        </label>
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {row ? 'Save cost' : 'Add it'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
