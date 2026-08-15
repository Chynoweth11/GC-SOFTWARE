/** Display formatting. Negatives render in parentheses, the accounting convention. */

const CURRENCY = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const CURRENCY_CENTS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(value: number | null | undefined, opts: { cents?: boolean; dash?: boolean } = {}): string {
  if (value == null || !isFinite(value)) return '-'
  if (opts.dash !== false && value === 0) return '-'
  const fmt = opts.cents ? CURRENCY_CENTS : CURRENCY
  return value < 0 ? `(${fmt.format(Math.abs(value))})` : fmt.format(value)
}

/** Compact form for KPI tiles and chart axes: $2.5M, $842K. */
export function moneyShort(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '-'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

export function percent(value: number | null | undefined, places = 1): string {
  if (value == null || !isFinite(value)) return '-'
  return `${(value * 100).toFixed(places)}%`
}

export function percentSigned(value: number | null | undefined, places = 1): string {
  if (value == null || !isFinite(value)) return '-'
  const formatted = `${(Math.abs(value) * 100).toFixed(places)}%`
  return value < 0 ? `−${formatted}` : `+${formatted}`
}

export function number(value: number | null | undefined, places = 0): string {
  if (value == null || !isFinite(value)) return '-'
  return value.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })
}

/**
 * A figure that carries its decimals when it has them, and none when it does not.
 *
 * `number(value, 1)` is the wrong tool for a measured quantity in both
 * directions. It writes 7 as "7.0", which invents a precision nobody recorded,
 * and it writes 7.25 as "7.3", which throws away a quarter of an hour somebody
 * did record. Hours, quantities and productivity rates are all measured, so
 * they get the decimals they actually have, up to a stated limit, and no more.
 *
 * The thousands separator stays, because a figure like 12,480.5 hours is read
 * wrong without it.
 */
export function decimal(value: number | null | undefined, maxPlaces = 2): string {
  if (value == null || !isFinite(value)) return '-'
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: maxPlaces })
}

/**
 * Hours, to the nearest hundredth where there is one.
 *
 * A timesheet is kept in quarter hours and a machine meter reads to a tenth, so
 * two places holds everything either of them can say. A whole number of hours
 * prints as a whole number.
 */
export function hours(value: number | null | undefined): string {
  return decimal(value, 2)
}

/**
 * A measured quantity: square feet, cubic yards, tons, each.
 *
 * Three places, because a cubic yard worked out from feet and inches lands on
 * awkward thirds, and rounding a takeoff quantity is how a bid quietly loses
 * material.
 */
export function quantity(value: number | null | undefined): string {
  return decimal(value, 3)
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const MONTH_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function date(value: Date | string | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  return isNaN(d.getTime()) ? '-' : DATE.format(d)
}

export function month(value: Date | string | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  return isNaN(d.getTime()) ? '-' : MONTH.format(d)
}

export function monthLong(value: Date | string | null | undefined): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  return isNaN(d.getTime()) ? '-' : MONTH_LONG.format(d)
}

/** Value for a date input, which needs YYYY-MM-DD in UTC. */
export function dateInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export function days(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '-'
  const rounded = Math.round(value)
  if (rounded === 0) return 'On time'
  return rounded > 0 ? `${rounded} days ahead` : `${Math.abs(rounded)} days behind`
}

/** Turns SCREAMING_SNAKE enum values into readable labels. */
export function titleize(value: string | null | undefined): string {
  if (!value) return '-'
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Direction a variance points for colouring. `favorableWhen` says which sign is
 * good: cost variances are favourable when positive (under budget), while a
 * days-behind figure is favourable when positive too, but an overbilling is neutral.
 */
export function varianceTone(
  value: number | null | undefined,
  favorableWhen: 'positive' | 'negative' = 'positive',
  tolerance = 0.005,
): 'favorable' | 'adverse' | 'neutral' {
  if (value == null || !isFinite(value) || Math.abs(value) <= tolerance) return 'neutral'
  const positive = value > 0
  return positive === (favorableWhen === 'positive') ? 'favorable' : 'adverse'
}
