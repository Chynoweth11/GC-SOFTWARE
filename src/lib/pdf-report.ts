import 'server-only'
import type { CellValue, SheetColumn, SheetSpec } from '@/lib/excel'
import type { PdfColumn, PdfDocument, PdfSection, PdfTable } from '@/lib/pdf'
import { date, money, number, percent } from '@/lib/format'

/**
 * Renders the same sheet specs the Excel exporter uses as a PDF.
 *
 * Both exports read one definition, so a column added to a report appears in
 * the workbook and the PDF together and neither can quietly fall behind.
 */

/** Usable text width: page width less both margins, matching pdf.ts. */
const CONTENT_WIDTH = 792 - 36 - 36

const RIGHT_ALIGNED: SheetColumn['format'][] = ['money', 'money2', 'percent', 'number']

function formatCell(value: CellValue, format: SheetColumn['format']): string {
  // A missing figure or date reads as an em-dash, exactly as it does on screen;
  // only free text is left blank.
  if (value == null || value === '') return format && format !== 'text' ? '—' : ''
  switch (format) {
    case 'money':
      return money(typeof value === 'number' ? value : Number(value))
    case 'money2':
      return money(typeof value === 'number' ? value : Number(value), { cents: true })
    case 'percent':
      return percent(typeof value === 'number' ? value : Number(value))
    case 'number':
      return number(typeof value === 'number' ? value : Number(value))
    case 'date':
      return date(value instanceof Date ? value : String(value))
    default:
      return String(value)
  }
}

/**
 * Excel column widths are in character units; PDF wants points. Rather than
 * convert, the widths are treated as relative weights and scaled to fill the
 * page, which keeps the two exports looking like the same document.
 */
function scaleColumns(columns: SheetColumn[]): PdfColumn[] {
  const weights = columns.map((c) => c.width ?? (c.format && RIGHT_ALIGNED.includes(c.format) ? 14 : 18))
  const total = weights.reduce((a, w) => a + w, 0) || 1
  return columns.map((column, index) => ({
    header: column.header,
    key: column.key,
    width: Math.max(34, (weights[index] / total) * CONTENT_WIDTH),
    align: column.format && RIGHT_ALIGNED.includes(column.format) ? 'right' : 'left',
  }))
}

function totalsFor(spec: SheetSpec): Record<string, string> | undefined {
  if (!spec.totalsRow || spec.rows.length === 0) return undefined
  const totals: Record<string, string> = {}
  spec.columns.forEach((column, index) => {
    if (index === 0) {
      totals[column.key] = `Total (${spec.rows.length})`
      return
    }
    if (!column.total) return
    const sum = spec.rows.reduce((acc, row) => {
      const value = row[column.key]
      return acc + (typeof value === 'number' && isFinite(value) ? value : 0)
    }, 0)
    totals[column.key] = formatCell(sum, column.format)
  })
  return totals
}

export function sheetToPdfSection(spec: SheetSpec, options: { includeNotes?: boolean } = {}): PdfSection {
  const table: PdfTable = {
    columns: scaleColumns(spec.columns),
    rows: spec.rows.map((row) => {
      const out: Record<string, string> = {}
      for (const column of spec.columns) out[column.key] = formatCell(row[column.key], column.format)
      return out
    }),
    totals: totalsFor(spec),
  }
  return {
    heading: spec.name,
    subheading: options.includeNotes === false ? undefined : spec.notes?.slice(1).join(' · '),
    table,
  }
}

export function sheetsToPdf(
  sheets: SheetSpec[],
  meta: { title: string; subtitle?: string; company: string; notes?: string[] },
): PdfDocument {
  return {
    title: meta.title,
    subtitle: meta.subtitle,
    meta: meta.notes ?? [meta.company, `Generated ${date(new Date())}`],
    sections: sheets.map((sheet) =>
      // A single-sheet export needs no repeated heading — the title already says it.
      sheets.length === 1 ? { ...sheetToPdfSection(sheet), heading: undefined, subheading: undefined } : sheetToPdfSection(sheet),
    ),
    footer: meta.company,
  }
}
