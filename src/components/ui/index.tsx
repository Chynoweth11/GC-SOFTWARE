import Link from 'next/link'
import type { ReactNode } from 'react'
import { money, moneyShort, percent, percentSigned, varianceTone } from '@/lib/format'

// ── KPI tiles ─────────────────────────────────────────────────────────────

export interface KpiProps {
  label: string
  value: string
  /** Secondary line: a variance, a comparison, a target. */
  detail?: ReactNode
  tone?: 'neutral' | 'favorable' | 'adverse' | 'caution'
  href?: string
  hint?: string
  chart?: ReactNode
}

export function Kpi({ label, value, detail, tone = 'neutral', href, hint, chart }: KpiProps) {
  const toneColor =
    tone === 'favorable' ? 'var(--favorable)' : tone === 'adverse' ? 'var(--adverse)' : tone === 'caution' ? 'var(--caution)' : 'var(--text)'

  const body = (
    <div className="card flex h-full flex-col gap-1 p-3.5 transition-shadow hover:shadow-[var(--shadow-raised)]">
      <div className="flex items-start justify-between gap-2">
        <span className="label">{label}</span>
        {hint && (
          <span
            className="cursor-help text-[10px] leading-none"
            title={hint}
            style={{ color: 'var(--text-subtle)' }}
            aria-label={hint}
          >
            ⓘ
          </span>
        )}
      </div>
      <span className="tnum text-[22px] font-semibold leading-tight" style={{ color: toneColor }}>
        {value}
      </span>
      {detail && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</div>}
      {chart && <div className="mt-auto pt-1">{chart}</div>}
    </div>
  )

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  )
}

/** A money KPI with the compact/full formatting decision already made. */
export function MoneyKpi({
  label,
  amount,
  detail,
  tone,
  href,
  hint,
  compact = true,
}: Omit<KpiProps, 'value'> & { amount: number; compact?: boolean }) {
  return (
    <Kpi
      label={label}
      value={compact ? moneyShort(amount) : money(amount)}
      detail={detail}
      tone={tone}
      href={href}
      hint={hint}
    />
  )
}

// ── Variance display ──────────────────────────────────────────────────────

export function Variance({
  value,
  favorableWhen = 'positive',
  format = 'money',
  compact = false,
  showSign = true,
}: {
  value: number | null | undefined
  favorableWhen?: 'positive' | 'negative'
  format?: 'money' | 'percent'
  compact?: boolean
  showSign?: boolean
}) {
  const tone = varianceTone(value, favorableWhen)
  const color = tone === 'favorable' ? 'var(--favorable)' : tone === 'adverse' ? 'var(--adverse)' : 'var(--text-muted)'

  if (value == null || !isFinite(value)) return <span style={{ color: 'var(--text-subtle)' }}>—</span>

  let text: string
  if (format === 'percent') {
    text = showSign ? percentSigned(value) : percent(value)
  } else {
    const formatted = compact ? moneyShort(Math.abs(value)) : money(Math.abs(value), { dash: false })
    text = showSign ? `${value < 0 ? '−' : '+'}${formatted}` : formatted
  }

  return (
    <span className="tnum font-medium" style={{ color }}>
      {text}
    </span>
  )
}

// ── Status pills ──────────────────────────────────────────────────────────

type PillTone = 'neutral' | 'accent' | 'favorable' | 'caution' | 'adverse'

const PILL_STYLES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: 'var(--surface-inset)', fg: 'var(--text-muted)' },
  accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  favorable: { bg: 'var(--favorable-soft)', fg: 'var(--favorable)' },
  caution: { bg: 'var(--caution-soft)', fg: 'var(--caution)' },
  adverse: { bg: 'var(--adverse-soft)', fg: 'var(--adverse)' },
}

export function Pill({ children, tone = 'neutral', dot }: { children: ReactNode; tone?: PillTone; dot?: boolean }) {
  const style = PILL_STYLES[tone]
  return (
    <span className="pill" style={{ background: style.bg, color: style.fg }}>
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: style.fg }} />}
      {children}
    </span>
  )
}

const STATUS_TONES: Record<string, PillTone> = {
  // project
  ACTIVE: 'accent', UNDER_CONSTRUCTION: 'accent', PRECONSTRUCTION: 'neutral', AWARDED: 'favorable',
  BIDDING: 'neutral', ON_HOLD: 'caution', COMPLETED: 'favorable', CLOSED: 'neutral',
  // health
  OK: 'favorable', WATCH: 'caution', 'HIGH RISK': 'adverse',
  Healthy: 'favorable', 'Thin Margin': 'caution', LOSS: 'adverse',
  'On / Ahead': 'favorable', Behind: 'caution', Critical: 'adverse', Unknown: 'neutral',
  // change orders
  DRAFT: 'neutral', PRICING: 'neutral', PENDING: 'caution', SUBMITTED: 'caution',
  UNDER_REVIEW: 'caution', APPROVED: 'favorable', EXECUTED: 'favorable',
  REJECTED: 'adverse', VOID: 'neutral',
  // billing
  PAID: 'favorable',
  // commitments
  ISSUED: 'accent', PARTIALLY_RECEIVED: 'caution', RECEIVED: 'favorable',
  INVOICED: 'accent', CANCELLED: 'neutral',
  // payments
  UNPAID: 'caution', PARTIAL: 'caution', OVERDUE: 'adverse',
  // buyout
  LEVELED: 'accent', BOUGHT_OUT: 'favorable',
  // bids
  LEAD: 'neutral', QUALIFYING: 'neutral', ESTIMATING: 'accent', PENDING_DECISION: 'caution',
  WON: 'favorable', LOST: 'adverse', NO_BID: 'neutral', WITHDRAWN: 'neutral',
  // forecast
  OPEN: 'accent', LOCKED: 'neutral',
  HIGH: 'adverse', MEDIUM: 'caution', LOW: 'favorable',
}

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral'
  const text =
    label ??
    (status.includes('_') || status === status.toUpperCase()
      ? status
          .toLowerCase()
          .split('_')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : status)
  return (
    <Pill tone={tone} dot>
      {text}
    </Pill>
  )
}

// ── Layout ────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  actions,
  meta,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
            {subtitle}
          </div>
        )}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 no-print">{actions}</div>}
    </header>
  )
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {(title || actions) && (
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
          <div>
            {title && (
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em]" style={{ color: 'var(--text-muted)' }}>
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 no-print">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const map = {
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  }
  return <div className={`grid grid-cols-1 gap-3 ${map[cols]}`}>{children}</div>
}

/** Label/value pairs for read-only summary panels. */
export function DataList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode; hint?: string }[]
  columns?: 1 | 2 | 3
}) {
  const map = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-2.5 ${map[columns]}`}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className="flex items-baseline justify-between gap-3 border-b pb-2 last:border-b-0" style={{ borderColor: 'var(--border)' }}>
          <dt className="text-xs" style={{ color: 'var(--text-muted)' }} title={item.hint}>
            {item.label}
            {item.hint && <span className="ml-1 cursor-help" style={{ color: 'var(--text-subtle)' }}>ⓘ</span>}
          </dt>
          <dd className="tnum shrink-0 text-sm font-medium" style={{ color: 'var(--text)' }}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon = '◦',
}: {
  title: string
  description?: string
  action?: ReactNode
  icon?: string
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center"
      style={{ borderColor: 'var(--border-strong)' }}
    >
      <div className="mb-3 text-3xl" style={{ color: 'var(--text-subtle)' }} aria-hidden>
        {icon}
      </div>
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-md text-xs" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{ background: 'var(--adverse-soft)', borderColor: 'var(--adverse)', color: 'var(--adverse)' }}
      role="alert"
    >
      {children}
    </div>
  )
}

export function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs"
      style={{ background: 'var(--accent-soft)', borderColor: 'color-mix(in oklab, var(--accent) 30%, transparent)', color: 'var(--accent)' }}
    >
      {children}
    </div>
  )
}

/** Marks a value the system computed, so it reads differently from an input. */
export function Calculated({ children, formula }: { children: ReactNode; formula?: string }) {
  return (
    <span
      className="tnum inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm"
      style={{ background: 'var(--surface-inset)', color: 'var(--text)' }}
      title={formula ? `Calculated: ${formula}` : 'Calculated automatically'}
    >
      {children}
      {formula && <span className="text-[9px] opacity-50" aria-hidden>ƒ</span>}
    </span>
  )
}

export function Tabs({
  tabs,
  active,
}: {
  tabs: { href: string; label: string; badge?: number }[]
  active: string
}) {
  return (
    <nav className="mb-5 flex gap-0.5 overflow-x-auto border-b no-print" style={{ borderColor: 'var(--border)' }}>
      {tabs.map((tab) => {
        const isActive = active === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="relative shrink-0 px-3 py-2 text-[13px] font-medium transition-colors"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span
                className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]"
                style={{ background: 'var(--surface-inset)', color: 'var(--text-muted)' }}
              >
                {tab.badge}
              </span>
            )}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t" style={{ background: 'var(--accent)' }} />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
