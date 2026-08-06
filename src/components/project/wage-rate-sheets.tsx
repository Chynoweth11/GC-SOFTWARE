'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Calculated, EmptyState, Pill, Section } from '@/components/ui'
import { date, dateInput, money, percent } from '@/lib/format'

/**
 * The prevailing wage sheet, laid out the way the certified form reads.
 *
 * Entered boxes on the left, computed burdens to the right of them, the loaded
 * hourly cost last. Only the entered boxes are saved; every other figure on
 * this page is worked out from them each time it is drawn, so the sheet on
 * screen, the sheet in the export and the sheet in a report cannot drift apart.
 *
 * The verification banner is not decoration. A sheet nobody has checked against
 * the published schedule says so at the top, in the strongest terms the page
 * has, because submitting one that is wrong is a wage claim rather than a
 * typographical error.
 */

export interface WageLineView {
  id: string
  trade: string
  classification: string | null
  hourlyWage: number
  hourlyBenefits: number
  trainingPerHour: number
  workersCompPerHour: number
  overtimeMultiplier: number
  publishedBaseWage: number | null
  publishedFringe: number | null
  notes: string | null
  /** Worked out on the server by the payroll engine. */
  derived: {
    subtotal: number
    futa: number
    fica: number
    suta: number
    training: number
    workersComp: number
    totalBurden: number
    total: number
    burdenPctOfWage: number
    overtimeTotal: number
    overtimeMultiplier: number
    compliance: { compliant: boolean; shortfall: number; reason: string | null } | null
  }
}

export interface WageSheetProps {
  id: string
  name: string
  rateScheduleDate: string | null
  determinationRef: string | null
  notes: string | null
  jurisdictionId: string
  jurisdictionLabel: string
  jurisdictionNotes: string | null
  wageAuthority: string | null
  workersCompBasis: 'PER_HOUR' | 'PER_100_PAYROLL'
  countyId: string | null
  countyLabel: string | null
  rates: { futaPct: number; ficaPct: number; sutaPct: number; sutaSource: string }
  sutaPctOverride: number | null
  verifiedAt: string | null
  verifiedByName: string | null
  verifiedNote: string | null
  jurisdictionVerifiedAt: string | null
  jurisdictionVerifiedNote: string | null
  issues: string[]
  totals: {
    hourlyWage: number
    hourlyBenefits: number
    subtotal: number
    futa: number
    fica: number
    suta: number
    training: number
    workersComp: number
    totalBurden: number
    total: number
  }
  averages: { hourlyWage: number; total: number; burdenPctOfWage: number }
  lines: WageLineView[]
}

export interface JurisdictionOption {
  id: string
  code: string
  name: string
  hasRate: boolean
  counties: { id: string; name: string }[]
}

type Action = (formData: FormData) => Promise<{ error?: string }>

export function WageRateSheets({
  projectId,
  sheets,
  jurisdictions,
  canEdit,
  saveSheet,
  deleteSheet,
  saveLine,
  deleteLine,
  verifySheet,
}: {
  projectId: string
  sheets: WageSheetProps[]
  jurisdictions: JurisdictionOption[]
  canEdit: boolean
  saveSheet: Action
  deleteSheet: Action
  saveLine: Action
  deleteLine: Action
  verifySheet: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingSheet, setEditingSheet] = useState<string | null>(null)
  const [addingSheet, setAddingSheet] = useState(false)
  const [editingLine, setEditingLine] = useState<string | null>(null)
  const [addingLineTo, setAddingLineTo] = useState<string | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)

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
    <div className="space-y-6">
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      {addingSheet && (
        <Section title="New wage sheet">
          <div className="card p-4">
            <SheetForm
              projectId={projectId}
              jurisdictions={jurisdictions}
              busy={busy}
              onCancel={() => setAddingSheet(false)}
              onSubmit={async (formData) => {
                if (await run(saveSheet, formData)) setAddingSheet(false)
              }}
            />
          </div>
        </Section>
      )}

      {sheets.length === 0 && !addingSheet ? (
        <EmptyState
          icon="§"
          title="No wage sheet on this project"
          description="Open a sheet when the job carries prevailing wage. It builds the fully loaded hourly cost for each trade from the published wage and fringe, with unemployment, social security, training and workers compensation stacked on top."
          action={
            canEdit ? (
              <button type="button" className="btn btn-primary" onClick={() => setAddingSheet(true)}>
                Open a wage sheet
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {canEdit && !addingSheet && (
            <div className="flex justify-end no-print">
              <button type="button" className="btn btn-ghost text-xs" onClick={() => setAddingSheet(true)}>
                Add a wage sheet
              </button>
            </div>
          )}

          {sheets.map((sheet) => (
            <Sheet
              key={sheet.id}
              sheet={sheet}
              projectId={projectId}
              jurisdictions={jurisdictions}
              canEdit={canEdit}
              busy={busy}
              editing={editingSheet === sheet.id}
              onEdit={() => setEditingSheet(sheet.id)}
              onStopEditing={() => setEditingSheet(null)}
              editingLine={editingLine}
              setEditingLine={setEditingLine}
              addingLine={addingLineTo === sheet.id}
              onAddLine={() => setAddingLineTo(sheet.id)}
              onStopAddingLine={() => setAddingLineTo(null)}
              verifying={verifying === sheet.id}
              onVerify={() => setVerifying(sheet.id)}
              onStopVerifying={() => setVerifying(null)}
              run={run}
              saveSheet={saveSheet}
              deleteSheet={deleteSheet}
              saveLine={saveLine}
              deleteLine={deleteLine}
              verifySheet={verifySheet}
            />
          ))}
        </>
      )}
    </div>
  )
}

function Sheet({
  sheet,
  projectId,
  jurisdictions,
  canEdit,
  busy,
  editing,
  onEdit,
  onStopEditing,
  editingLine,
  setEditingLine,
  addingLine,
  onAddLine,
  onStopAddingLine,
  verifying,
  onVerify,
  onStopVerifying,
  run,
  saveSheet,
  deleteSheet,
  saveLine,
  deleteLine,
  verifySheet,
}: {
  sheet: WageSheetProps
  projectId: string
  jurisdictions: JurisdictionOption[]
  canEdit: boolean
  busy: boolean
  editing: boolean
  onEdit: () => void
  onStopEditing: () => void
  editingLine: string | null
  setEditingLine: (id: string | null) => void
  addingLine: boolean
  onAddLine: () => void
  onStopAddingLine: () => void
  verifying: boolean
  onVerify: () => void
  onStopVerifying: () => void
  run: (action: Action, formData: FormData) => Promise<boolean>
  saveSheet: Action
  deleteSheet: Action
  saveLine: Action
  deleteLine: Action
  verifySheet: Action
}) {
  const verified = Boolean(sheet.verifiedAt)

  return (
    <section className="card overflow-hidden">
      <header
        className="border-b px-4 py-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)' }}
      >
        {editing ? (
          <SheetForm
            projectId={projectId}
            sheet={sheet}
            jurisdictions={jurisdictions}
            busy={busy}
            onCancel={onStopEditing}
            onSubmit={async (formData) => {
              if (await run(saveSheet, formData)) onStopEditing()
            }}
          />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                {sheet.name}
              </h2>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {sheet.jurisdictionLabel}
                {sheet.countyLabel ? `, ${sheet.countyLabel} County` : ', county not recorded'}
                {' · '}
                {sheet.rateScheduleDate ? `Schedule dated ${date(sheet.rateScheduleDate)}` : 'No schedule date'}
                {sheet.determinationRef ? ` · ${sheet.determinationRef}` : ''}
              </p>
              {sheet.wageAuthority && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                  Determinations published by {sheet.wageAuthority}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={verified ? 'favorable' : 'caution'} dot>
                {verified ? 'Verified' : 'Not verified'}
              </Pill>
              {canEdit && (
                <>
                  <button type="button" className="btn btn-ghost text-xs" onClick={onVerify}>
                    {verified ? 'Verification' : 'Verify'}
                  </button>
                  <button type="button" className="btn btn-ghost text-xs" onClick={onEdit}>
                    Edit
                  </button>
                  <ConfirmButton
                    label="Delete"
                    confirmLabel="Delete sheet"
                    title={`Delete ${sheet.name}`}
                    description={`This removes the sheet and its ${sheet.lines.length} trade${sheet.lines.length === 1 ? '' : 's'}. The deletion is recorded permanently in the audit history.`}
                    onConfirm={async () => {
                      const formData = new FormData()
                      formData.set('id', sheet.id)
                      await run(deleteSheet, formData)
                    }}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="space-y-4 px-4 py-4">
        <VerificationPanel sheet={sheet} />

        {verifying && canEdit && (
          <form
            action={async (formData) => {
              if (await run(verifySheet, formData)) onStopVerifying()
            }}
            className="rounded-lg border p-3"
            style={{ borderColor: 'var(--border-strong)' }}
          >
            <input type="hidden" name="id" value={sheet.id} />
            <label className="block text-xs font-medium" style={{ color: 'var(--text)' }}>
              What was checked, and against what
            </label>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
              For example: checked against the {sheet.jurisdictionLabel} schedule effective 3 March 2026 for{' '}
              {sheet.countyLabel ?? 'the county'}, and against our 2026 unemployment rate notice.
            </p>
            <textarea
              name="verifiedNote"
              rows={2}
              defaultValue={sheet.verifiedNote ?? ''}
              className="field mt-2 w-full text-xs"
              aria-label="Verification note"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                Record the check
              </button>
              {sheet.verifiedAt && (
                <button
                  type="submit"
                  name="clear"
                  value="true"
                  className="btn btn-ghost text-xs"
                  disabled={busy}
                  formNoValidate
                >
                  Withdraw the verification
                </button>
              )}
              <button type="button" className="btn btn-ghost text-xs" onClick={onStopVerifying}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {sheet.issues.length > 0 && (
          <div
            className="rounded-lg border px-3 py-2"
            style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--caution)' }}>
              Before this sheet is submitted
            </p>
            <ul className="mt-1 space-y-0.5 text-xs" style={{ color: 'var(--caution)' }}>
              {sheet.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <RateBasis sheet={sheet} />

        {sheet.lines.length === 0 ? (
          <EmptyState
            icon="◦"
            title="No trades on this sheet"
            description="Add each classification the schedule names, with the wage and fringe it requires."
            action={
              canEdit ? (
                <button type="button" className="btn btn-primary" onClick={onAddLine}>
                  Add a trade
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
                    <th>Trade</th>
                    <th className="num">1 Wage</th>
                    <th className="num">2 Benefit</th>
                    <th className="num">Subtotal</th>
                    <th className="num">3 FUTA</th>
                    <th className="num">4 FICA</th>
                    <th className="num">5 SUTA</th>
                    <th className="num">6 T and E</th>
                    <th className="num">7 Workers comp</th>
                    <th className="num">Burden</th>
                    <th className="num">Loaded rate</th>
                    <th className="num">Overtime</th>
                    {canEdit && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {sheet.lines.map((line) =>
                    editingLine === line.id ? (
                      <tr key={line.id}>
                        <td colSpan={canEdit ? 13 : 12} className="top">
                          <LineForm
                            sheetId={sheet.id}
                            line={line}
                            busy={busy}
                            onCancel={() => setEditingLine(null)}
                            onSubmit={async (formData) => {
                              if (await run(saveLine, formData)) setEditingLine(null)
                            }}
                          />
                        </td>
                      </tr>
                    ) : (
                      <LineRow
                        key={line.id}
                        line={line}
                        canEdit={canEdit}
                        onEdit={() => setEditingLine(line.id)}
                        onDelete={async () => {
                          const formData = new FormData()
                          formData.set('id', line.id)
                          await run(deleteLine, formData)
                        }}
                      />
                    ),
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <th>All trades</th>
                    <th className="num">{money(sheet.totals.hourlyWage, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.hourlyBenefits, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.subtotal, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.futa, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.fica, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.suta, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.training, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.workersComp, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.totalBurden, { cents: true })}</th>
                    <th className="num">{money(sheet.totals.total, { cents: true })}</th>
                    <th className="num" />
                    {canEdit && <th className="no-print" />}
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-subtle)' }}>Average of the trades on this sheet</td>
                    <td className="num">{money(sheet.averages.hourlyWage, { cents: true })}</td>
                    <td className="num" colSpan={8} />
                    <td className="num">{money(sheet.averages.total, { cents: true })}</td>
                    <td className="num" />
                    {canEdit && <td className="no-print" />}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {addingLine && canEdit && (
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-strong)' }}>
            <LineForm
              sheetId={sheet.id}
              busy={busy}
              onCancel={onStopAddingLine}
              onSubmit={async (formData) => {
                if (await run(saveLine, formData)) onStopAddingLine()
              }}
            />
          </div>
        )}

        {canEdit && !addingLine && sheet.lines.length > 0 && (
          <div className="no-print">
            <button type="button" className="btn btn-ghost text-xs" onClick={onAddLine}>
              Add a trade
            </button>
          </div>
        )}

        {sheet.notes && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {sheet.notes}
          </p>
        )}
      </div>
    </section>
  )
}

function VerificationPanel({ sheet }: { sheet: WageSheetProps }) {
  if (sheet.verifiedAt) {
    return (
      <div
        className="rounded-lg border px-3 py-2 text-xs"
        style={{ background: 'var(--favorable-soft)', borderColor: 'var(--favorable)', color: 'var(--favorable)' }}
      >
        Verified {date(sheet.verifiedAt)}
        {sheet.verifiedByName ? ` by ${sheet.verifiedByName}` : ''}
        {sheet.verifiedNote ? `. ${sheet.verifiedNote}` : ''}
      </div>
    )
  }
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
      role="alert"
    >
      Nobody has checked this sheet against the published schedule. Do that before it is used to price work or to
      certify a payroll.
    </div>
  )
}

/** Says where every rate on the sheet came from, and how sure it is. */
function RateBasis({ sheet }: { sheet: WageSheetProps }) {
  const items = [
    { label: 'Federal unemployment', value: percent(sheet.rates.futaPct, 3), hint: 'Company setting, the same in every state' },
    { label: 'Social security and Medicare', value: percent(sheet.rates.ficaPct, 3), hint: 'Company setting, employer share' },
    {
      label: 'State unemployment',
      value: sheet.rates.sutaSource === 'not set' ? 'Not set' : percent(sheet.rates.sutaPct, 3),
      hint:
        sheet.rates.sutaSource === 'not set'
          ? 'Assigned to each employer every year. Enter it in Settings, payroll.'
          : `From the ${sheet.rates.sutaSource}`,
    },
    {
      label: 'Workers compensation',
      value: sheet.workersCompBasis === 'PER_HOUR' ? 'Per hour worked' : 'Per 100 of payroll',
      hint:
        sheet.workersCompBasis === 'PER_HOUR'
          ? 'This state quotes the premium per hour worked, so the published rate goes straight in item 7'
          : 'Divide the published rate by 100 and multiply by the wage to get the per hour figure for item 7',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-inset)' }}
        >
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {item.label}
          </div>
          <div className="tnum mt-0.5 text-sm font-medium" style={{ color: 'var(--text)' }}>
            {item.value}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--text-subtle)' }}>
            {item.hint}
          </div>
        </div>
      ))}
    </div>
  )
}

function LineRow({
  line,
  canEdit,
  onEdit,
  onDelete,
}: {
  line: WageLineView
  canEdit: boolean
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const compliance = line.derived.compliance

  return (
    <tr>
      <td>
        <span className="font-medium">{line.trade}</span>
        {line.classification && (
          <span className="ml-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
            {line.classification}
          </span>
        )}
        {compliance && !compliance.compliant && (
          <div className="wrap mt-0.5 text-[11px]" style={{ color: 'var(--adverse)' }}>
            {compliance.reason}
          </div>
        )}
        {compliance?.compliant && (
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--favorable)' }}>
            Meets the published determination
          </div>
        )}
      </td>
      <td className="num">{money(line.hourlyWage, { cents: true })}</td>
      <td className="num">{money(line.hourlyBenefits, { cents: true })}</td>
      <td className="num">
        <Calculated formula="wage + benefit">{money(line.derived.subtotal, { cents: true })}</Calculated>
      </td>
      <td className="num">{money(line.derived.futa, { cents: true })}</td>
      <td className="num">{money(line.derived.fica, { cents: true })}</td>
      <td className="num">{money(line.derived.suta, { cents: true })}</td>
      <td className="num">{money(line.trainingPerHour, { cents: true })}</td>
      <td className="num">{money(line.workersCompPerHour, { cents: true })}</td>
      <td className="num" title={`${percent(line.derived.burdenPctOfWage)} of the wage`}>
        {money(line.derived.totalBurden, { cents: true })}
      </td>
      <td className="num font-semibold">
        <Calculated formula="subtotal + items 3 to 7">{money(line.derived.total, { cents: true })}</Calculated>
      </td>
      <td className="num" title={`At ${line.derived.overtimeMultiplier} times the wage`}>
        {money(line.derived.overtimeTotal, { cents: true })}
      </td>
      {canEdit && (
        <td className="no-print">
          <div className="flex items-center justify-end gap-1">
            <button type="button" className="btn btn-ghost text-xs" onClick={onEdit}>
              Edit
            </button>
            <ConfirmButton
              label="Remove"
              confirmLabel="Remove trade"
              title={`Remove ${line.trade}`}
              description="The removal is recorded permanently in the audit history."
              onConfirm={onDelete}
            />
          </div>
        </td>
      )}
    </tr>
  )
}

function SheetForm({
  projectId,
  sheet,
  jurisdictions,
  busy,
  onSubmit,
  onCancel,
}: {
  projectId: string
  sheet?: WageSheetProps
  jurisdictions: JurisdictionOption[]
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const [jurisdictionId, setJurisdictionId] = useState(sheet?.jurisdictionId ?? jurisdictions[0]?.id ?? '')
  const counties = useMemo(
    () => jurisdictions.find((j) => j.id === jurisdictionId)?.counties ?? [],
    [jurisdictions, jurisdictionId],
  )

  return (
    <form action={onSubmit} className="space-y-3">
      {sheet && <input type="hidden" name="id" value={sheet.id} />}
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Sheet name
          </span>
          <input
            name="name"
            defaultValue={sheet?.name ?? ''}
            required
            placeholder="Journey level, Benton County"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            State
          </span>
          <select
            name="jurisdictionId"
            value={jurisdictionId}
            onChange={(event) => setJurisdictionId(event.target.value)}
            required
            className="field mt-1 w-full text-sm"
          >
            {jurisdictions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
                {option.hasRate ? '' : ' (no unemployment rate yet)'}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            County
          </span>
          <select name="countyId" defaultValue={sheet?.countyId ?? ''} className="field mt-1 w-full text-sm">
            <option value="">Not recorded</option>
            {counties.map((county) => (
              <option key={county.id} value={county.id}>
                {county.name}
              </option>
            ))}
          </select>
          {counties.length === 0 && (
            <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
              No counties are set up for this state yet. Add them in Settings, payroll.
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Rate schedule date
          </span>
          <input
            type="date"
            name="rateScheduleDate"
            defaultValue={sheet?.rateScheduleDate ? dateInput(sheet.rateScheduleDate) : ''}
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Determination reference
          </span>
          <input
            name="determinationRef"
            defaultValue={sheet?.determinationRef ?? ''}
            placeholder="General decision, or the agreement name"
            className="field mt-1 w-full text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            State unemployment rate for this sheet
          </span>
          <input
            name="sutaPctOverride"
            defaultValue={sheet?.sutaPctOverride !== null && sheet?.sutaPctOverride !== undefined ? (sheet.sutaPctOverride * 100).toString() : ''}
            placeholder="Leave empty to use the state rate"
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-1 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            A percentage. Only fill this in when this job carries a different rate from the one on the state.
          </span>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <textarea name="notes" rows={2} defaultValue={sheet?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {sheet ? 'Save sheet' : 'Open the sheet'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function LineForm({
  sheetId,
  line,
  busy,
  onSubmit,
  onCancel,
}: {
  sheetId: string
  line?: WageLineView
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  const fields: { name: string; label: string; value: string; hint?: string; width?: string }[] = [
    { name: 'trade', label: 'Trade', value: line?.trade ?? '', width: 'sm:col-span-2' },
    { name: 'classification', label: 'Classification', value: line?.classification ?? '' },
    { name: 'hourlyWage', label: '1 Hourly wage', value: line ? String(line.hourlyWage) : '' },
    { name: 'hourlyBenefits', label: '2 Hourly benefit', value: line ? String(line.hourlyBenefits) : '' },
    { name: 'trainingPerHour', label: '6 Training per hour', value: line ? String(line.trainingPerHour) : '0' },
    {
      name: 'workersCompPerHour',
      label: '7 Workers comp per hour',
      value: line ? String(line.workersCompPerHour) : '0',
    },
    { name: 'overtimeMultiplier', label: 'Overtime multiplier', value: line ? String(line.overtimeMultiplier) : '1.5' },
    {
      name: 'publishedBaseWage',
      label: 'Published base wage',
      value: line?.publishedBaseWage != null ? String(line.publishedBaseWage) : '',
      hint: 'Optional, for checking the row',
    },
    {
      name: 'publishedFringe',
      label: 'Published fringe',
      value: line?.publishedFringe != null ? String(line.publishedFringe) : '',
      hint: 'Optional, for checking the row',
    },
  ]

  return (
    <form action={onSubmit} className="space-y-3">
      {line && <input type="hidden" name="id" value={line.id} />}
      <input type="hidden" name="sheetId" value={sheetId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {fields.map((field) => (
          <label key={field.name} className={`block ${field.width ?? ''}`}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              {field.label}
            </span>
            <input
              name={field.name}
              defaultValue={field.value}
              required={field.name === 'trade'}
              className="field mt-1 w-full text-sm"
            />
            {field.hint && (
              <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                {field.hint}
              </span>
            )}
          </label>
        ))}
      </div>

      <label className="block">
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          Notes
        </span>
        <input name="notes" defaultValue={line?.notes ?? ''} className="field mt-1 w-full text-sm" />
      </label>

      <div className="flex items-center gap-2">
        <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
          {line ? 'Save trade' : 'Add the trade'}
        </button>
        <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
