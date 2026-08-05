'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { money } from '@/lib/format'
import type { Alert } from '@/lib/finance'

type Severity = Alert['severity']

const TONE: Record<Severity, { soft: string; strong: string; label: string; plural: string }> = {
  CRITICAL: { soft: 'var(--adverse-soft)', strong: 'var(--adverse)', label: 'Critical', plural: 'Critical' },
  WARNING: { soft: 'var(--caution-soft)', strong: 'var(--caution)', label: 'Warning', plural: 'Warnings' },
  INFO: { soft: 'var(--accent-soft)', strong: 'var(--accent)', label: 'Note', plural: 'Notes' },
}

const ORDER: Severity[] = ['CRITICAL', 'WARNING', 'INFO']

/**
 * The attention list.
 *
 * Grouped by how urgent each item is, with a filter across the top so a long
 * list can be cut to one severity or one subject area. Every row states what is
 * wrong, what it is worth, which records it concerns, and the next step, so the
 * list can be worked straight down rather than interpreted.
 */
export function AlertList({
  alerts,
  showProject = true,
  initialLimit = 6,
}: {
  alerts: Alert[]
  showProject?: boolean
  initialLimit?: number
}) {
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [expanded, setExpanded] = useState(false)

  const counts = useMemo(() => {
    const map: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, INFO: 0 }
    for (const alert of alerts) map[alert.severity]++
    return map
  }, [alerts])

  const categories = useMemo(
    () => [...new Set(alerts.map((alert) => alert.category))].sort(),
    [alerts],
  )

  const filtered = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          (severityFilter === 'ALL' || alert.severity === severityFilter) &&
          (!categoryFilter || alert.category === categoryFilter),
      ),
    [alerts, severityFilter, categoryFilter],
  )

  const visible = expanded ? filtered : filtered.slice(0, initialLimit)

  if (alerts.length === 0) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-xl border p-3.5"
        style={{
          background: 'var(--favorable-soft)',
          borderColor: 'color-mix(in oklab, var(--favorable) 30%, transparent)',
        }}
      >
        <CheckIcon />
        <div>
          <p className="text-[13px] font-medium" style={{ color: 'var(--favorable)' }}>
            Nothing needs attention
          </p>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            No budget overruns, no forecast deterioration, no margin erosion and no overdue positions.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip
          label={`All ${alerts.length}`}
          active={severityFilter === 'ALL'}
          onClick={() => setSeverityFilter('ALL')}
        />
        {ORDER.filter((severity) => counts[severity] > 0).map((severity) => (
          <FilterChip
            key={severity}
            label={`${TONE[severity].plural} ${counts[severity]}`}
            active={severityFilter === severity}
            tone={TONE[severity]}
            onClick={() => setSeverityFilter(severityFilter === severity ? 'ALL' : severity)}
          />
        ))}

        {categories.length > 1 && (
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="field ml-auto max-w-[11rem] py-1 text-xs"
            aria-label="Filter by subject"
          >
            <option value="">Every subject</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
          Nothing matches that filter.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((alert) => (
            <AlertRow key={alert.id} alert={alert} showProject={showProject} />
          ))}
        </ul>
      )}

      {filtered.length > initialLimit && (
        <button type="button" className="btn btn-ghost w-full py-1.5 text-xs" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  )
}

function AlertRow({ alert, showProject }: { alert: Alert; showProject: boolean }) {
  const tone = TONE[alert.severity]

  return (
    <li
      className="overflow-hidden rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)' }}
    >
      <div className="flex">
        {/* A colour rail rather than a badge: severity reads at a glance without
            competing with the sentence next to it. */}
        <span className="w-1 shrink-0" style={{ background: tone.strong }} aria-hidden />

        <div className="min-w-0 flex-1 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: tone.soft, color: tone.strong }}
                >
                  {tone.label}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
                >
                  {alert.category}
                </span>
                {showProject && alert.projectNumber && (
                  <span className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                    {alert.projectNumber} · {alert.projectName}
                  </span>
                )}
              </div>

              <p className="mt-1.5 text-[13px] font-semibold leading-snug" style={{ color: 'var(--text)' }}>
                {alert.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {alert.detail}
              </p>
            </div>

            {alert.value != null && Number.isFinite(alert.value) && (
              <div className="shrink-0 text-right">
                <div className="tnum text-[15px] font-semibold" style={{ color: tone.strong }}>
                  {money(Math.abs(alert.value), { dash: false })}
                </div>
                {alert.valueLabel && (
                  <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-subtle)' }}>
                    {alert.valueLabel}
                  </div>
                )}
              </div>
            )}
          </div>

          {alert.subjects && alert.subjects.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {alert.subjects.map((subject) => (
                <span
                  key={subject}
                  className="rounded px-1.5 py-0.5 text-[11px]"
                  style={{ background: 'var(--surface-inset)', color: 'var(--text-muted)' }}
                >
                  {subject}
                </span>
              ))}
            </div>
          )}

          {(alert.action || alert.href) && (
            <div
              className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5"
              style={{ borderColor: 'var(--border)' }}
            >
              {alert.action && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>Next step: </span>
                  {alert.action}
                </span>
              )}
              {alert.href && (
                <Link href={alert.href} className="btn btn-secondary shrink-0 px-2.5 py-1 text-xs">
                  Open
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function FilterChip({
  label,
  active,
  tone,
  onClick,
}: {
  label: string
  active: boolean
  tone?: { soft: string; strong: string }
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
      style={{
        background: active ? (tone?.soft ?? 'var(--accent-soft)') : 'transparent',
        borderColor: active ? (tone?.strong ?? 'var(--accent)') : 'var(--border-strong)',
        color: active ? (tone?.strong ?? 'var(--accent)') : 'var(--text-muted)',
      }}
    >
      {label}
    </button>
  )
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mt-0.5 h-4 w-4 shrink-0"
      fill="none"
      stroke="var(--favorable)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
