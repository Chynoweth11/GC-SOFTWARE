'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { date, money, percent } from '@/lib/format'

/**
 * The fifty states and the District of Columbia, as payroll sees them.
 *
 * All of them are here from the start so a wage sheet can be opened for work
 * anywhere without setting the state up first. None of them ships with a tax
 * rate, because the state unemployment rate is assigned to each employer every
 * year: the list shows plainly which states have had a rate entered and checked
 * and which have not, and the ones in use are lifted to the top so the two or
 * three states a company actually builds in are not buried in the other forty-eight.
 */

export interface CountyNode {
  id: string
  name: string
  notes: string | null
  verifiedAt: string | null
}

export interface JurisdictionNode {
  id: string
  code: string
  name: string
  sutaPct: number | null
  sutaWageBase: number | null
  sutaRateYear: number | null
  workersCompBasis: 'PER_HOUR' | 'PER_100_PAYROLL'
  stateFund: boolean
  wageAuthority: string | null
  notes: string | null
  verifiedAt: string | null
  verifiedByName: string | null
  verifiedNote: string | null
  active: boolean
  countyCount: number
  sheetCount: number
  counties: CountyNode[]
}

type Action = (formData: FormData) => Promise<{ error?: string }>

/** Reports how many were new and how many were already on the state. */
type CountyImportAction = (
  formData: FormData,
) => Promise<{ error?: string; added?: number; alreadyThere?: number }>

export function JurisdictionManager({
  jurisdictions,
  canEdit,
  save,
  verify,
  saveCounty,
  deleteCounty,
  importCounties,
}: {
  jurisdictions: JurisdictionNode[]
  canEdit: boolean
  save: Action
  verify: Action
  saveCounty: Action
  deleteCounty: Action
  importCounties: CountyImportAction
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

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

  const inUse = useMemo(
    () => jurisdictions.filter((j) => j.sheetCount > 0 || j.sutaPct !== null || j.countyCount > 0),
    [jurisdictions],
  )

  const shown = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (term) {
      return jurisdictions.filter(
        (j) => j.name.toLowerCase().includes(term) || j.code.toLowerCase().includes(term),
      )
    }
    return showAll ? jurisdictions : inUse
  }, [jurisdictions, query, showAll, inUse])

  const withRate = jurisdictions.filter((j) => j.sutaPct !== null).length
  const verified = jurisdictions.filter((j) => j.verifiedAt).length

  return (
    <div>
      {error && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find a state"
          className="field h-8 w-56 text-xs"
          aria-label="Find a state"
        />
        {!query && (
          <button type="button" className="btn btn-ghost text-xs" onClick={() => setShowAll((value) => !value)}>
            {showAll ? `Show only the ${inUse.length} in use` : `Show all ${jurisdictions.length}`}
          </button>
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--text-subtle)' }}>
          {withRate} of {jurisdictions.length} have an unemployment rate entered, {verified} checked
        </span>
      </div>

      <div className="space-y-2">
        {shown.map((jurisdiction) => (
          <Jurisdiction
            key={jurisdiction.id}
            jurisdiction={jurisdiction}
            canEdit={canEdit}
            busy={busy}
            open={open === jurisdiction.id}
            onToggle={() => setOpen(open === jurisdiction.id ? null : jurisdiction.id)}
            run={run}
            save={save}
            verify={verify}
            saveCounty={saveCounty}
            deleteCounty={deleteCounty}
            importCounties={importCounties}
          />
        ))}
        {shown.length === 0 && (
          <p className="py-6 text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
            No state matches {query}.
          </p>
        )}
      </div>
    </div>
  )
}

function Jurisdiction({
  jurisdiction,
  canEdit,
  busy,
  open,
  onToggle,
  run,
  save,
  verify,
  saveCounty,
  deleteCounty,
  importCounties,
}: {
  jurisdiction: JurisdictionNode
  canEdit: boolean
  busy: boolean
  open: boolean
  onToggle: () => void
  run: (action: Action, formData: FormData) => Promise<boolean>
  save: Action
  verify: Action
  saveCounty: Action
  deleteCounty: Action
  importCounties: CountyImportAction
}) {
  const router = useRouter()
  const [addingCounty, setAddingCounty] = useState(false)
  const [editingCounty, setEditingCounty] = useState<string | null>(null)
  const [pastingCounties, setPastingCounties] = useState(false)
  const [countyResult, setCountyResult] = useState<string | null>(null)

  const rateLabel =
    jurisdiction.sutaPct === null
      ? 'No unemployment rate'
      : `${percent(jurisdiction.sutaPct, 3)} unemployment${jurisdiction.sutaRateYear ? ` for ${jurisdiction.sutaRateYear}` : ''}`

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left"
        style={{ background: open ? 'var(--surface-inset)' : 'transparent' }}
        aria-expanded={open}
      >
        <span className="pill" style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}>
          {jurisdiction.code}
        </span>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {jurisdiction.name}
        </span>
        <span
          className="text-xs"
          style={{ color: jurisdiction.sutaPct === null ? 'var(--text-subtle)' : 'var(--text-muted)' }}
        >
          {rateLabel}
        </span>
        {jurisdiction.verifiedAt ? (
          <span className="pill" style={{ background: 'var(--favorable-soft)', color: 'var(--favorable)' }}>
            Checked {date(jurisdiction.verifiedAt)}
          </span>
        ) : (
          jurisdiction.sutaPct !== null && (
            <span className="pill" style={{ background: 'var(--caution-soft)', color: 'var(--caution)' }}>
              Not checked
            </span>
          )
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--text-subtle)' }}>
          {jurisdiction.countyCount} count{jurisdiction.countyCount === 1 ? 'y' : 'ies'}
          {jurisdiction.sheetCount > 0
            ? `, ${jurisdiction.sheetCount} wage sheet${jurisdiction.sheetCount === 1 ? '' : 's'}`
            : ''}
          {open ? ' ▴' : ' ▾'}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t px-4 py-4" style={{ borderColor: 'var(--border)' }}>
          {jurisdiction.notes && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {jurisdiction.notes}
            </p>
          )}

          {canEdit ? (
            <form
              action={async (formData) => {
                await run(save, formData)
              }}
              className="space-y-3"
            >
              <input type="hidden" name="id" value={jurisdiction.id} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    State unemployment rate
                  </span>
                  <input
                    name="sutaPct"
                    defaultValue={jurisdiction.sutaPct === null ? '' : (jurisdiction.sutaPct * 100).toString()}
                    placeholder="Percent, from your annual notice"
                    className="field mt-1 w-full text-sm"
                  />
                  <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                    Assigned to each employer every year. Changing it clears the check below.
                  </span>
                </label>

                <label className="block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Taxable wage base
                  </span>
                  <input
                    name="sutaWageBase"
                    defaultValue={jurisdiction.sutaWageBase === null ? '' : String(jurisdiction.sutaWageBase)}
                    placeholder="Dollars per employee per year"
                    className="field mt-1 w-full text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Rate year
                  </span>
                  <input
                    name="sutaRateYear"
                    defaultValue={jurisdiction.sutaRateYear === null ? '' : String(jurisdiction.sutaRateYear)}
                    placeholder="2026"
                    className="field mt-1 w-full text-sm"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Workers compensation is quoted
                  </span>
                  <select
                    name="workersCompBasis"
                    defaultValue={jurisdiction.workersCompBasis}
                    className="field mt-1 w-full text-sm"
                  >
                    <option value="PER_100_PAYROLL">Per 100 dollars of payroll</option>
                    <option value="PER_HOUR">Per hour worked</option>
                  </select>
                </label>

                <label className="block lg:col-span-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Who publishes the determinations
                  </span>
                  <input
                    name="wageAuthority"
                    defaultValue={jurisdiction.wageAuthority ?? ''}
                    placeholder="Not recorded"
                    className="field mt-1 w-full text-sm"
                  />
                </label>

                <label className="block lg:col-span-2">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    Notes
                  </span>
                  <input name="notes" defaultValue={jurisdiction.notes ?? ''} className="field mt-1 w-full text-sm" />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" name="stateFund" defaultChecked={jurisdiction.stateFund} />
                  Workers compensation is bought from the state fund
                </label>
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" name="active" defaultChecked={jurisdiction.active} />
                  Offer this state when opening a wage sheet
                </label>
                <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                  Save {jurisdiction.name}
                </button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
              <Fact label="State unemployment rate" value={jurisdiction.sutaPct === null ? 'Not entered' : percent(jurisdiction.sutaPct, 3)} />
              <Fact
                label="Taxable wage base"
                value={jurisdiction.sutaWageBase === null ? 'Not entered' : money(jurisdiction.sutaWageBase)}
              />
              <Fact
                label="Workers compensation"
                value={jurisdiction.workersCompBasis === 'PER_HOUR' ? 'Per hour worked' : 'Per 100 of payroll'}
              />
              <Fact label="Determinations published by" value={jurisdiction.wageAuthority ?? 'Not recorded'} />
            </dl>
          )}

          {canEdit && (
            <form
              action={async (formData) => {
                await run(verify, formData)
              }}
              className="rounded-lg border p-3"
              style={{ borderColor: 'var(--border-strong)' }}
            >
              <input type="hidden" name="id" value={jurisdiction.id} />
              <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                {jurisdiction.verifiedAt
                  ? `Checked ${date(jurisdiction.verifiedAt)}${jurisdiction.verifiedByName ? ` by ${jurisdiction.verifiedByName}` : ''}`
                  : 'This rate has not been checked'}
              </div>
              {jurisdiction.verifiedNote && (
                <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                  {jurisdiction.verifiedNote}
                </p>
              )}
              <input
                name="verifiedNote"
                defaultValue={jurisdiction.verifiedNote ?? ''}
                placeholder="Where the rate came from, for example the 2026 rate notice dated 12 December"
                className="field mt-2 w-full text-xs"
                aria-label="Where the rate came from"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                  Record the check
                </button>
                {jurisdiction.verifiedAt && (
                  <button type="submit" name="clear" value="true" className="btn btn-ghost text-xs" disabled={busy}>
                    Withdraw it
                  </button>
                )}
              </div>
            </form>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-muted)' }}>
                Counties
              </h4>
              {canEdit && !addingCounty && !pastingCounties && (
                <div className="flex items-center gap-1">
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setAddingCounty(true)}>
                    Add a county
                  </button>
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setPastingCounties(true)}>
                    Paste a list
                  </button>
                </div>
              )}
            </div>

            {pastingCounties && canEdit && (
              <form
                action={async (formData) => {
                  setCountyResult(null)
                  const outcome = await importCounties(formData)
                  if (outcome?.error) {
                    setCountyResult(outcome.error)
                    return
                  }
                  const added = outcome.added ?? 0
                  const known = outcome.alreadyThere ?? 0
                  setCountyResult(
                    added === 0
                      ? `Nothing new. All ${known} were already here.`
                      : `${added} added${known > 0 ? `, ${known} already here` : ''}.`,
                  )
                  setPastingCounties(false)
                  router.refresh()
                }}
                className="mb-2 rounded-lg border p-2"
                style={{ borderColor: 'var(--border-strong)' }}
              >
                <input type="hidden" name="jurisdictionId" value={jurisdiction.id} />
                <textarea
                  name="counties"
                  rows={5}
                  required
                  className="field w-full font-mono text-xs"
                  placeholder={`Paste the county list published by ${jurisdiction.name}, one to a line or separated by commas. "County" on the end is trimmed, and anything already here is left alone.`}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
                    Add them
                  </button>
                  <button type="button" className="btn btn-ghost text-xs" onClick={() => setPastingCounties(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {countyResult && (
              <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }} role="status">
                {countyResult}
              </p>
            )}

            {jurisdiction.counties.length === 0 && !addingCounty && (
              <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                No counties yet for {jurisdiction.name}. Prevailing wage is determined county by county, so add the ones
                this company works in as jobs reach them.
              </p>
            )}

            {addingCounty && canEdit && (
              <CountyForm
                jurisdictionId={jurisdiction.id}
                busy={busy}
                onCancel={() => setAddingCounty(false)}
                onSubmit={async (formData) => {
                  if (await run(saveCounty, formData)) setAddingCounty(false)
                }}
              />
            )}

            {jurisdiction.counties.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {jurisdiction.counties.map((county) =>
                  editingCounty === county.id && canEdit ? (
                    <CountyForm
                      key={county.id}
                      jurisdictionId={jurisdiction.id}
                      county={county}
                      busy={busy}
                      onCancel={() => setEditingCounty(null)}
                      onSubmit={async (formData) => {
                        if (await run(saveCounty, formData)) setEditingCounty(null)
                      }}
                    />
                  ) : (
                    <span
                      key={county.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                      style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      title={county.notes ?? undefined}
                    >
                      {county.name}
                      {canEdit && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingCounty(county.id)}
                            className="opacity-50 hover:opacity-100"
                            aria-label={`Edit ${county.name}`}
                          >
                            ✎
                          </button>
                          <ConfirmButton
                            label="✕"
                            confirmLabel="Remove county"
                            title={`Remove ${county.name}`}
                            description={`This removes ${county.name} from ${jurisdiction.name}. The removal is recorded permanently in the audit history.`}
                            onConfirm={async () => {
                              const formData = new FormData()
                              formData.set('id', county.id)
                              await run(deleteCounty, formData)
                            }}
                          />
                        </>
                      )}
                    </span>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-1.5" style={{ borderColor: 'var(--border)' }}>
      <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
      <dd className="tnum font-medium" style={{ color: 'var(--text)' }}>
        {value}
      </dd>
    </div>
  )
}

function CountyForm({
  jurisdictionId,
  county,
  busy,
  onSubmit,
  onCancel,
}: {
  jurisdictionId: string
  county?: CountyNode
  busy: boolean
  onSubmit: (formData: FormData) => Promise<void>
  onCancel: () => void
}) {
  return (
    <form action={onSubmit} className="flex flex-wrap items-center gap-2">
      {county && <input type="hidden" name="id" value={county.id} />}
      <input type="hidden" name="jurisdictionId" value={jurisdictionId} />
      <input
        name="name"
        defaultValue={county?.name ?? ''}
        required
        placeholder="County name"
        className="field h-7 w-44 text-xs"
        aria-label="County name"
      />
      <input
        name="notes"
        defaultValue={county?.notes ?? ''}
        placeholder="Anything local about the rates here"
        className="field h-7 w-72 text-xs"
        aria-label="County notes"
      />
      <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
        Save
      </button>
      <button type="button" className="btn btn-ghost text-xs" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

/**
 * The two federal rates.
 *
 * A client component only so the server action's error message has somewhere to
 * land; the values themselves are read on the server and rendered by the page.
 */
export function FederalRatesForm({
  futaPct,
  ficaPct,
  canEdit,
  save,
}: {
  futaPct: number
  ficaPct: number
  canEdit: boolean
  save: Action
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <form
      action={async (formData) => {
        setBusy(true)
        setError(null)
        setSaved(false)
        const result = await save(formData)
        setBusy(false)
        if (result?.error) {
          setError(result.error)
          return
        }
        setSaved(true)
        router.refresh()
      }}
      className="card p-4"
    >
      {error && (
        <div
          className="mb-3 rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Federal unemployment
          </span>
          <input
            name="futaPct"
            defaultValue={(futaPct * 100).toString()}
            disabled={!canEdit}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            A percentage. The net rate after the credit against the gross 6.0 percent.
          </span>
        </label>

        <label className="block">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Social security and Medicare
          </span>
          <input
            name="ficaPct"
            defaultValue={(ficaPct * 100).toString()}
            disabled={!canEdit}
            className="field mt-1 w-full text-sm"
          />
          <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            A percentage. The employer share, 6.2 plus 1.45.
          </span>
        </label>

        {canEdit && (
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-primary text-xs" disabled={busy}>
              Save federal rates
            </button>
            {saved && (
              <span className="text-xs" style={{ color: 'var(--favorable)' }}>
                Saved
              </span>
            )}
          </div>
        )}
      </div>
    </form>
  )
}
