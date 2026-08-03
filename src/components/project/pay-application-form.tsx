'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { money, percent } from '@/lib/format'

interface SovRow {
  id: string
  number: string
  description: string
  scheduledValue: number
  fromPrevious: number
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? 'Issuing…' : 'Issue application'}
    </button>
  )
}

export function PayApplicationForm({
  projectId,
  appNumber,
  retainagePct,
  lines,
  action,
}: {
  projectId: string
  appNumber: number
  retainagePct: number
  lines: SovRow[]
  action: (formData: FormData) => Promise<{ error?: string }>
}) {
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [work, setWork] = useState<Record<string, number>>({})
  const [stored, setStored] = useState<Record<string, number>>({})
  const [retainage, setRetainage] = useState(retainagePct)

  const totals = useMemo(() => {
    const thisPeriod = lines.reduce((a, l) => a + (work[l.id] ?? 0) + (stored[l.id] ?? 0), 0)
    const previous = lines.reduce((a, l) => a + l.fromPrevious, 0)
    const cumulative = previous + thisPeriod
    const retainageAmount = cumulative * retainage
    const earnedLessRetainage = cumulative - retainageAmount
    const previousCertificates = previous - previous * retainage
    return {
      thisPeriod,
      cumulative,
      retainageAmount,
      earnedLessRetainage,
      previousCertificates,
      paymentDue: earnedLessRetainage - previousCertificates,
      scheduledTotal: lines.reduce((a, l) => a + l.scheduledValue, 0),
    }
  }, [lines, work, stored, retainage])

  const overbilledLines = lines.filter(
    (l) => l.fromPrevious + (work[l.id] ?? 0) + (stored[l.id] ?? 0) > l.scheduledValue + 0.005,
  )

  if (lines.length === 0) {
    return (
      <div className="card p-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        This project has no schedule of values yet. Add one before issuing a pay application.
      </div>
    )
  }

  return (
    <form
      action={async (formData) => {
        setError(null)
        setSaved(false)
        const result = await action(formData)
        if (result?.error) setError(result.error)
        else {
          setSaved(true)
          setWork({})
          setStored({})
        }
      }}
      className="card space-y-3 p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="appNumber" value={appNumber} />

      {error && (
        <div className="rounded-lg border px-3 py-2 text-xs" style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }} role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 40%, transparent)', color: 'var(--favorable)' }}
          role="status"
        >
          Application issued. It now appears in the register and the receivable position.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label htmlFor="pa-period" className="label mb-1.5 block">
            Period to
          </label>
          <input id="pa-period" name="periodTo" type="date" required className="field text-xs" />
        </div>
        <div>
          <label htmlFor="pa-submitted" className="label mb-1.5 block">
            Date submitted
          </label>
          <input id="pa-submitted" name="dateSubmitted" type="date" className="field text-xs" />
        </div>
        <div>
          <label htmlFor="pa-retainage" className="label mb-1.5 block">
            Retainage (0–1)
          </label>
          <input
            id="pa-retainage"
            name="retainagePct"
            type="number"
            step="0.01"
            min="0"
            max="0.5"
            className="field text-xs"
            value={retainage}
            onChange={(e) => setRetainage(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <label htmlFor="pa-notes" className="label mb-1.5 block">
            Notes
          </label>
          <input id="pa-notes" name="notes" className="field text-xs" placeholder="Optional" />
        </div>
      </div>

      {overbilledLines.length > 0 && (
        <div
          className="rounded-lg border px-3 py-2 text-xs"
          style={{ background: 'var(--caution-soft)', borderColor: 'var(--caution)', color: 'var(--caution)' }}
        >
          {overbilledLines.length} line{overbilledLines.length === 1 ? '' : 's'} would bill past their scheduled value:{' '}
          {overbilledLines.map((l) => l.number).join(', ')}.
        </div>
      )}

      <div className="card-flush">
        <div className="table-wrap" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Item</th>
                <th>Description</th>
                <th className="num">Scheduled value</th>
                <th className="num">From previous</th>
                <th className="num" style={{ width: 130 }}>
                  Work this period
                </th>
                <th className="num" style={{ width: 130 }}>
                  Stored materials
                </th>
                <th className="num">Total to date</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const cumulative = l.fromPrevious + (work[l.id] ?? 0) + (stored[l.id] ?? 0)
                const over = cumulative > l.scheduledValue + 0.005
                return (
                  <tr key={l.id}>
                    <td className="font-medium">{l.number}</td>
                    <td className="max-w-[16rem] truncate" title={l.description}>
                      {l.description}
                    </td>
                    <td className="num">{money(l.scheduledValue)}</td>
                    <td className="num">{money(l.fromPrevious)}</td>
                    <td>
                      <input
                        name={`work_${l.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        className="field py-1 text-right text-xs"
                        value={work[l.id] ?? ''}
                        onChange={(e) => setWork((w) => ({ ...w, [l.id]: Number(e.target.value) || 0 }))}
                        aria-label={`Work this period for ${l.description}`}
                      />
                    </td>
                    <td>
                      <input
                        name={`stored_${l.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        className="field py-1 text-right text-xs"
                        value={stored[l.id] ?? ''}
                        onChange={(e) => setStored((s) => ({ ...s, [l.id]: Number(e.target.value) || 0 }))}
                        aria-label={`Stored materials for ${l.description}`}
                      />
                    </td>
                    <td className="num calculated" style={over ? { color: 'var(--adverse)' } : undefined}>
                      {money(cumulative)}
                    </td>
                    <td className="num calculated">{percent(l.scheduledValue ? cumulative / l.scheduledValue : 0, 0)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total</td>
                <td className="num">{money(totals.scheduledTotal)}</td>
                <td className="num">{money(lines.reduce((a, l) => a + l.fromPrevious, 0))}</td>
                <td className="num">{money(lines.reduce((a, l) => a + (work[l.id] ?? 0), 0))}</td>
                <td className="num">{money(lines.reduce((a, l) => a + (stored[l.id] ?? 0), 0))}</td>
                <td className="num">{money(totals.cumulative)}</td>
                <td className="num">{percent(totals.scheduledTotal ? totals.cumulative / totals.scheduledTotal : 0, 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-lg px-3 py-2.5"
        style={{ background: 'var(--surface-inset)' }}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <div style={{ color: 'var(--text-subtle)' }}>Completed &amp; stored</div>
            <div className="tnum font-medium">{money(totals.cumulative)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-subtle)' }}>Retainage</div>
            <div className="tnum font-medium">{money(totals.retainageAmount)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-subtle)' }}>Less previous</div>
            <div className="tnum font-medium">{money(totals.previousCertificates)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-subtle)' }}>Payment due</div>
            <div className="tnum text-sm font-semibold" style={{ color: 'var(--accent)' }}>
              {money(totals.paymentDue)}
            </div>
          </div>
        </div>
        <Submit />
      </div>
    </form>
  )
}
