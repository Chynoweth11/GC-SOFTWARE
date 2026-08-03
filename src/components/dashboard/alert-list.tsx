import Link from 'next/link'
import type { Alert } from '@/lib/finance'

const TONE: Record<Alert['severity'], { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: 'var(--adverse-soft)', fg: 'var(--adverse)', label: 'Critical' },
  WARNING: { bg: 'var(--caution-soft)', fg: 'var(--caution)', label: 'Warning' },
  INFO: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'Note' },
}

export function AlertList({ alerts, showProject = true }: { alerts: Alert[]; showProject?: boolean }) {
  if (alerts.length === 0) {
    return (
      <div
        className="rounded-lg border px-3 py-2.5 text-xs"
        style={{ background: 'var(--favorable-soft)', borderColor: 'color-mix(in oklab, var(--favorable) 30%, transparent)', color: 'var(--favorable)' }}
      >
        Nothing needs attention — no budget overruns, forecast deterioration, margin erosion or overdue positions detected.
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {alerts.map((alert) => {
        const tone = TONE[alert.severity]
        const body = (
          <div
            className="flex items-start gap-3 rounded-lg border p-3 transition-colors"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)' }}
          >
            <span
              className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {tone.label}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--text)' }}>
                  {alert.title}
                </span>
                {showProject && alert.projectNumber && (
                  <span className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                    {alert.projectNumber} · {alert.projectName}
                  </span>
                )}
                <span
                  className="rounded px-1.5 text-[10px]"
                  style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
                >
                  {alert.category}
                </span>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                {alert.detail}
              </p>
            </div>
          </div>
        )

        return (
          <li key={alert.id}>
            {alert.href ? (
              <Link href={alert.href} className="block hover:opacity-90">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        )
      })}
    </ul>
  )
}
