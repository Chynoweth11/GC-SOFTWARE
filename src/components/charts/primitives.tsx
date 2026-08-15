'use client'

import { useId, useMemo, useState, type ReactNode } from 'react'
import { decimal, hours, money, moneyShort } from '@/lib/format'
import { barWidths, donutArcs, donutPath, extentOf, niceTicks, sparklinePoints } from '@/lib/charts/geometry'

/**
 * Chart primitives.
 *
 * Hand-built SVG rather than a charting library: the whole system needs perhaps
 * eight chart forms, all reading the same financial series, and building them
 * directly keeps every axis, tooltip and colour consistent with the rest of the
 * design system, and keeps the client bundle small.
 *
 * The arithmetic behind the shapes lives in `@/lib/charts/geometry`, where it
 * can be tested. What is left here is the drawing.
 */

/** Categorical palette. Ordered so the first three read clearly apart at a glance. */
export const SERIES_COLORS = [
  'var(--accent)',
  'var(--favorable)',
  'var(--caution)',
  '#8b5cf6',
  '#0891b2',
  '#e0669a',
  '#84a12a',
  '#f97316',
] as const

/**
 * Charts are client components, so the value formatter is named rather than
 * passed as a function: server components cannot hand a closure across the
 * boundary. Every chart in the system uses one of these four.
 */
export type ValueFormat = 'money' | 'moneyShort' | 'percent' | 'number' | 'hours'

/*
  An axis label states its tick, not a rounded impression of it.

  `percent(v, 0)` writes a tick of 0.125 as "13%", which puts a label on the
  axis that no gridline is at. `decimal` gives it the place it needs and none it
  does not, so a tick at a quarter reads 25% and one at an eighth reads 12.5%.
  Hours and counts are measured, so they keep their decimals too.
*/
const FORMATTERS: Record<ValueFormat, (v: number) => string> = {
  money: (v) => money(v, { dash: false }),
  moneyShort,
  percent: (v) => `${decimal(v * 100, 1)}%`,
  number: (v) => decimal(v, 2),
  hours: (v) => `${hours(v)} hr`,
}

function resolveFormat(format: ValueFormat = 'moneyShort') {
  return FORMATTERS[format] ?? FORMATTERS.moneyShort
}

export interface Series {
  key: string
  label: string
  color?: string
  values: (number | null)[]
  /** Renders as a dashed line: used for plan vs. actual and scenarios. */
  dashed?: boolean
  /** Fills the area under a line. */
  area?: boolean
}

export interface ChartProps {
  labels: string[]
  series: Series[]
  height?: number
  format?: ValueFormat
  /** Index from which the data becomes forecast rather than actual. */
  forecastFromIndex?: number
  yAxisWidth?: number
  className?: string
}

const PAD = { top: 12, right: 12, bottom: 26 }

function useExtent(series: Series[], includeZero = true) {
  return useMemo(
    () => extentOf(series.flatMap((s) => s.values), includeZero),
    [series, includeZero],
  )
}

interface TooltipState {
  index: number
  x: number
}

function ChartTooltip({
  state,
  labels,
  series,
  format,
  width,
}: {
  state: TooltipState
  labels: string[]
  series: Series[]
  format: (v: number) => string
  width: number
}) {
  const rows = series
    .map((s) => ({ ...s, value: s.values[state.index] }))
    .filter((s) => s.value != null)
  if (rows.length === 0) return null

  const flip = state.x > width * 0.6
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[9rem] rounded-lg px-2.5 py-2 text-xs shadow-lg"
      style={{
        left: flip ? undefined : `${(state.x / width) * 100}%`,
        right: flip ? `${100 - (state.x / width) * 100}%` : undefined,
        top: 4,
        transform: flip ? 'translateX(-8px)' : 'translateX(8px)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-strong)',
      }}
    >
      <div className="mb-1 font-semibold" style={{ color: 'var(--text)' }}>
        {labels[state.index]}
      </div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: r.color ?? 'var(--accent)' }}
            />
            {r.label}
          </span>
          <span className="tnum font-medium" style={{ color: 'var(--text)' }}>
            {format(r.value as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

function Axes({
  ticks,
  scaleY,
  width,
  height,
  yAxisWidth,
  format,
  labels,
  labelStep,
  plotWidth,
}: {
  ticks: number[]
  scaleY: (v: number) => number
  width: number
  height: number
  yAxisWidth: number
  format: (v: number) => string
  labels: string[]
  labelStep: number
  plotWidth: number
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={yAxisWidth}
            x2={width - PAD.right}
            y1={scaleY(t)}
            y2={scaleY(t)}
            stroke="var(--border)"
            strokeWidth={1}
            strokeDasharray={t === 0 ? undefined : '3 3'}
          />
          <text
            x={yAxisWidth - 6}
            y={scaleY(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fill="var(--text-subtle)"
            className="tnum"
          >
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((label, i) =>
        i % labelStep === 0 ? (
          <text
            key={`${label}-${i}`}
            x={yAxisWidth + (plotWidth / Math.max(labels.length - 1, 1)) * i}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="var(--text-subtle)"
          >
            {label}
          </text>
        ) : null,
      )}
    </g>
  )
}

// ── Line / area chart ─────────────────────────────────────────────────────

export function LineChart({
  labels,
  series,
  height = 240,
  format = 'moneyShort',
  forecastFromIndex,
  yAxisWidth = 56,
  className,
}: ChartProps) {
  const id = useId()
  const fmt = resolveFormat(format)
  const [hover, setHover] = useState<TooltipState | null>(null)
  const width = 800
  const { min, max } = useExtent(series)
  const ticks = niceTicks(min, max)
  const domainMin = Math.min(min, ticks[0])
  const domainMax = Math.max(max, ticks[ticks.length - 1])
  const plotWidth = width - yAxisWidth - PAD.right
  const plotHeight = height - PAD.top - PAD.bottom

  const scaleX = (i: number) => yAxisWidth + (plotWidth / Math.max(labels.length - 1, 1)) * i
  const scaleY = (v: number) => PAD.top + plotHeight - ((v - domainMin) / (domainMax - domainMin || 1)) * plotHeight

  const labelStep = Math.max(1, Math.ceil(labels.length / 10))

  const paths = series.map((s, si) => {
    const color = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length]
    const points = s.values.map((v, i) => (v == null ? null : { x: scaleX(i), y: scaleY(v) }))
    const segments: string[] = []
    let current: string[] = []
    for (const p of points) {
      if (p == null) {
        if (current.length) segments.push(current.join(' '))
        current = []
      } else {
        current.push(`${current.length === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      }
    }
    if (current.length) segments.push(current.join(' '))

    const defined = points.filter((p): p is { x: number; y: number } => p != null)
    const areaPath =
      s.area && defined.length > 1
        ? `M${defined[0].x.toFixed(2)},${scaleY(Math.max(domainMin, 0)).toFixed(2)} ${defined
            .map((p) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`)
            .join(' ')} L${defined[defined.length - 1].x.toFixed(2)},${scaleY(Math.max(domainMin, 0)).toFixed(2)} Z`
        : null

    return { series: s, color, path: segments.join(' '), areaPath }
  })

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * width
          const i = Math.round(((x - yAxisWidth) / plotWidth) * Math.max(labels.length - 1, 1))
          if (i >= 0 && i < labels.length) setHover({ index: i, x: scaleX(i) })
        }}
      >
        <defs>
          {paths.map((p, i) => (
            <linearGradient key={p.series.key} id={`${id}-grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={p.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        <Axes
          ticks={ticks}
          scaleY={scaleY}
          width={width}
          height={height}
          yAxisWidth={yAxisWidth}
          format={fmt}
          labels={labels}
          labelStep={labelStep}
          plotWidth={plotWidth}
        />

        {forecastFromIndex != null && forecastFromIndex < labels.length && (
          <>
            <rect
              x={scaleX(forecastFromIndex)}
              y={PAD.top}
              width={Math.max(0, width - PAD.right - scaleX(forecastFromIndex))}
              height={plotHeight}
              fill="var(--text)"
              opacity={0.03}
            />
            <line
              x1={scaleX(forecastFromIndex)}
              x2={scaleX(forecastFromIndex)}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke="var(--border-strong)"
              strokeDasharray="4 3"
            />
          </>
        )}

        {paths.map((p, i) => (
          <g key={p.series.key}>
            {p.areaPath && <path d={p.areaPath} fill={`url(#${id}-grad-${i})`} />}
            <path
              d={p.path}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={p.series.dashed ? '5 4' : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}

        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={PAD.top + plotHeight}
              stroke="var(--text-subtle)"
              strokeWidth={1}
            />
            {paths.map((p) => {
              const v = p.series.values[hover.index]
              return v == null ? null : (
                <circle
                  key={p.series.key}
                  cx={hover.x}
                  cy={scaleY(v)}
                  r={3.5}
                  fill="var(--surface-raised)"
                  stroke={p.color}
                  strokeWidth={2}
                />
              )
            })}
          </>
        )}
      </svg>

      {hover && (
        <ChartTooltip
          state={hover}
          labels={labels}
          series={paths.map((p) => ({ ...p.series, color: p.color }))}
          format={fmt}
          width={width}
        />
      )}

      <Legend series={paths.map((p) => ({ ...p.series, color: p.color }))} />
    </div>
  )
}

// ── Bar chart (grouped or stacked) ────────────────────────────────────────

export function BarChart({
  labels,
  series,
  height = 240,
  format = 'moneyShort',
  stacked = false,
  yAxisWidth = 56,
  horizontal = false,
  className,
}: ChartProps & { stacked?: boolean; horizontal?: boolean }) {
  const [hover, setHover] = useState<TooltipState | null>(null)
  const fmt = resolveFormat(format)
  const width = 800

  const stackedExtent = useMemo(() => {
    if (!stacked) return null
    const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] ?? 0), 0))
    return { min: Math.min(0, ...totals), max: Math.max(0, ...totals) }
  }, [stacked, labels, series])

  const plain = useExtent(series)
  const { min, max } = stackedExtent ?? plain
  const ticks = niceTicks(min, max)
  const domainMin = Math.min(min, ticks[0])
  const domainMax = Math.max(max, ticks[ticks.length - 1])

  const plotWidth = width - yAxisWidth - PAD.right
  const plotHeight = height - PAD.top - PAD.bottom
  const scaleY = (v: number) => PAD.top + plotHeight - ((v - domainMin) / (domainMax - domainMin || 1)) * plotHeight

  const groupWidth = plotWidth / Math.max(labels.length, 1)
  const barPadding = Math.min(10, groupWidth * 0.18)
  const innerWidth = groupWidth - barPadding * 2
  const barWidth = stacked ? innerWidth : innerWidth / Math.max(series.length, 1)

  if (horizontal) {
    return (
      <HorizontalBars labels={labels} series={series} format={format} className={className} />
    )
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        role="img"
        aria-label={series.map((s) => s.label).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * width
          const i = Math.floor((x - yAxisWidth) / groupWidth)
          if (i >= 0 && i < labels.length) setHover({ index: i, x: yAxisWidth + groupWidth * (i + 0.5) })
        }}
      >
        <Axes
          ticks={ticks}
          scaleY={scaleY}
          width={width}
          height={height}
          yAxisWidth={yAxisWidth}
          format={fmt}
          labels={labels}
          labelStep={Math.max(1, Math.ceil(labels.length / 12))}
          plotWidth={plotWidth}
        />

        {labels.map((_, i) => {
          const groupX = yAxisWidth + groupWidth * i + barPadding
          let positiveBase = 0
          let negativeBase = 0
          return (
            <g key={i} opacity={hover && hover.index !== i ? 0.55 : 1}>
              {series.map((s, si) => {
                const v = s.values[i]
                if (v == null || v === 0) return null
                const color = s.color ?? SERIES_COLORS[si % SERIES_COLORS.length]
                if (stacked) {
                  const base = v >= 0 ? positiveBase : negativeBase
                  const top = base + v
                  if (v >= 0) positiveBase = top
                  else negativeBase = top
                  const y = scaleY(Math.max(base, top))
                  const h = Math.abs(scaleY(top) - scaleY(base))
                  return (
                    <rect
                      key={s.key}
                      x={groupX}
                      y={y}
                      width={Math.max(barWidth, 1)}
                      height={Math.max(h, 1)}
                      fill={color}
                      rx={2}
                    />
                  )
                }
                const zero = scaleY(Math.max(domainMin, 0))
                const y = Math.min(scaleY(v), zero)
                const h = Math.abs(scaleY(v) - zero)
                return (
                  <rect
                    key={s.key}
                    x={groupX + barWidth * si}
                    y={y}
                    width={Math.max(barWidth - 1.5, 1)}
                    height={Math.max(h, 1)}
                    fill={color}
                    rx={2}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {hover && (
        <ChartTooltip
          state={hover}
          labels={labels}
          series={series.map((s, si) => ({ ...s, color: s.color ?? SERIES_COLORS[si % SERIES_COLORS.length] }))}
          format={fmt}
          width={width}
        />
      )}

      <Legend series={series.map((s, si) => ({ ...s, color: s.color ?? SERIES_COLORS[si % SERIES_COLORS.length] }))} />
    </div>
  )
}

/** Ranked horizontal bars: the right form for "cost by trade" style comparisons. */
export function HorizontalBars({
  labels,
  series,
  format = 'moneyShort',
  className,
  maxRows = 12,
}: {
  labels: string[]
  series: Series[]
  format?: ValueFormat
  className?: string
  maxRows?: number
}) {
  const fmt = resolveFormat(format)
  const primary = series[0]
  const rows = labels
    .map((label, i) => ({ label, values: series.map((s) => s.values[i] ?? 0) }))
    .slice(0, maxRows)
  // One scale across every row and every series, so two bars on one chart can
  // be compared with each other and with the row above.
  const scaleMax = Math.max(1, ...rows.flatMap((r) => r.values.map((v) => Math.abs(v))))

  if (!primary || rows.length === 0) return <EmptyChart />

  return (
    <div className={`space-y-2.5 ${className ?? ''}`}>
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate" style={{ color: 'var(--text-muted)' }}>
              {row.label}
            </span>
            <span className="tnum shrink-0 font-medium" style={{ color: 'var(--text)' }}>
              {fmt(row.values[0])}
            </span>
          </div>
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-inset)' }}>
            {row.values.map((v, si) => (
              <div
                key={series[si].key}
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${barWidths([v], scaleMax)[0]}%`,
                  background: series[si].color ?? SERIES_COLORS[si % SERIES_COLORS.length],
                }}
                title={`${series[si].label}: ${fmt(v)}`}
              />
            ))}
          </div>
        </div>
      ))}
      {series.length > 1 && <Legend series={series.map((s, si) => ({ ...s, color: s.color ?? SERIES_COLORS[si % SERIES_COLORS.length] }))} />}
    </div>
  )
}

// ── Donut ─────────────────────────────────────────────────────────────────

export interface DonutSlice {
  label: string
  value: number
  color?: string
}

export function DonutChart({
  slices,
  format = 'moneyShort',
  centerLabel,
  centerValue,
  size = 180,
  className,
}: {
  slices: DonutSlice[]
  format?: ValueFormat
  centerLabel?: string
  centerValue?: string
  size?: number
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const fmt = resolveFormat(format)
  const total = slices.reduce((a, s) => a + Math.abs(s.value), 0)
  if (total === 0) return <EmptyChart />

  const thickness = size * 0.19

  /*
    The angles come from `donutArcs`, which is tested: the slices sweep to
    exactly a full turn, each one starts where the last ended, and a credit is
    shown at its size rather than eating its neighbour. Only the colour and the
    label are decided here.
  */
  const geometry = donutArcs(slices.map((slice) => slice.value))
  const arcs = geometry.map((arc, i) => ({
    slice: slices[i],
    fraction: arc.fraction,
    color: slices[i].color ?? SERIES_COLORS[i % SERIES_COLORS.length],
    d: donutPath(arc, size, thickness),
  }))

  return (
    <div className={`flex flex-wrap items-center gap-5 ${className ?? ''}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Distribution">
          {arcs.map((arc, i) => (
            <path
              key={arc.slice.label}
              d={arc.d}
              fill={arc.color}
              opacity={hover == null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-default transition-opacity"
            />
          ))}
        </svg>
        {(centerValue || hover != null) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="tnum text-base font-semibold" style={{ color: 'var(--text)' }}>
              {hover != null ? fmt(arcs[hover].slice.value) : centerValue}
            </div>
            <div className="mt-0.5 max-w-[70%] text-[10px] leading-tight" style={{ color: 'var(--text-subtle)' }}>
              {hover != null ? arcs[hover].slice.label : centerLabel}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-[9rem] flex-1 space-y-1.5">
        {arcs.map((arc, i) => (
          <div
            key={arc.slice.label}
            className="flex items-center justify-between gap-3 text-xs"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: arc.color }} />
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                {arc.slice.label}
              </span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--text)' }}>
              {fmt(arc.slice.value)}
              <span className="ml-1.5" style={{ color: 'var(--text-subtle)' }}>
                {(arc.fraction * 100).toFixed(0)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Small components ──────────────────────────────────────────────────────

export function Legend({ series }: { series: Series[] }) {
  if (series.length <= 1) return null
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span
            className="inline-block h-0.5 w-3 rounded-full"
            style={{
              background: s.dashed
                ? `repeating-linear-gradient(90deg, ${s.color ?? 'var(--accent)'} 0 3px, transparent 3px 6px)`
                : (s.color ?? 'var(--accent)'),
              height: s.area ? 8 : 2,
              borderRadius: s.area ? 2 : 999,
            }}
          />
          {s.label}
        </span>
      ))}
    </div>
  )
}

/** Inline trend line for table cells and compact tiles. */
export function Sparkline({
  values,
  color = 'var(--accent)',
  width = 88,
  height = 24,
}: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  const points = sparklinePoints(values, width, height)
  if (points.length === 0) {
    return <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>-</span>
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Progress meter used for percent-complete and budget-consumed readouts. */
export function Meter({
  value,
  target,
  tone = 'accent',
  showLabel = true,
  height = 6,
}: {
  value: number
  target?: number
  tone?: 'accent' | 'favorable' | 'caution' | 'adverse'
  showLabel?: boolean
  height?: number
}) {
  const pct = Math.max(0, Math.min(1, value))
  const color = `var(--${tone === 'accent' ? 'accent' : tone})`
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative flex-1 overflow-hidden rounded-full"
        style={{ height, background: 'var(--surface-inset)' }}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct * 100}%`, background: color }}
        />
        {target != null && (
          <div
            className="absolute top-0 h-full w-0.5"
            style={{ left: `${Math.min(100, target * 100)}%`, background: 'var(--text)' }}
            title={`Target ${(target * 100).toFixed(0)}%`}
          />
        )}
      </div>
      {showLabel && (
        <span className="tnum w-10 shrink-0 text-right text-xs" style={{ color: 'var(--text-muted)' }}>
          {(pct * 100).toFixed(0)}%
        </span>
      )}
    </div>
  )
}

/** Diverging bar for variances: left of centre is adverse, right is favourable. */
export function VarianceBar({ value, max }: { value: number; max: number }) {
  const bound = Math.max(Math.abs(max), 1)
  const pct = Math.min(1, Math.abs(value) / bound)
  const favorable = value >= 0
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-inset)' }}>
      <div className="absolute left-1/2 top-0 h-full w-px" style={{ background: 'var(--border-strong)' }} />
      <div
        className="absolute top-0 h-full rounded-full"
        style={{
          width: `${(pct * 100) / 2}%`,
          left: favorable ? '50%' : undefined,
          right: favorable ? undefined : '50%',
          background: favorable ? 'var(--favorable)' : 'var(--adverse)',
        }}
      />
    </div>
  )
}

export function EmptyChart({ message = 'No data for this period yet' }: { message?: string }) {
  return (
    <div
      className="flex h-40 items-center justify-center rounded-lg border border-dashed text-xs"
      style={{ borderColor: 'var(--border-strong)', color: 'var(--text-subtle)' }}
    >
      {message}
    </div>
  )
}

export function ChartFrame({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`card p-4 ${className ?? ''}`}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
