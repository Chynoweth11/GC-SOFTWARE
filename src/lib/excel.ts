import 'server-only'
import ExcelJS from 'exceljs'

/**
 * Excel writing.
 *
 * Exports are real workbooks, not CSV renamed: number formats, frozen headers,
 * column widths and a totals row, so the file opens looking like the report it
 * came from rather than something that needs cleaning up first.
 */

export type CellValue = string | number | Date | null | undefined

export interface SheetColumn {
  header: string
  key: string
  width?: number
  /** money renders as accounting, percent as 0.0%, and number as plain. */
  format?: 'money' | 'money2' | 'percent' | 'number' | 'hours' | 'quantity' | 'date' | 'text'
  /** Included in the totals row when the sheet has one. */
  total?: boolean
}

export interface SheetSpec {
  name: string
  columns: SheetColumn[]
  rows: Record<string, CellValue>[]
  /** Rendered above the header as context: title, filters, as-of date. */
  notes?: string[]
  totalsRow?: boolean
}

/*
  Decimal places are stated, never defaulted, and they match what the PDF of the
  same sheet prints. The cell always carries the full value; these decide what a
  reader sees. Trailing zeros are optional throughout, so a whole number stays
  whole rather than claiming a precision nobody measured.
*/
const NUMBER_FORMATS: Record<NonNullable<SheetColumn['format']>, string> = {
  money: '$#,##0;($#,##0);"-"',
  money2: '$#,##0.00;($#,##0.00);"-"',
  percent: '0.0%',
  number: '#,##0.##',
  hours: '#,##0.##',
  quantity: '#,##0.###',
  date: 'mmm d, yyyy',
  text: '@',
}

const HEADER_FILL = 'FFECEEF1'
const TOTAL_FILL = 'FFF5F6F8'

export function buildWorkbook(sheets: SheetSpec[], meta: { title: string; company: string }): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ConstructX'
  workbook.created = new Date()
  workbook.title = meta.title
  workbook.company = meta.company

  for (const spec of sheets) {
    // Excel sheet names cannot exceed 31 chars or contain []:*?/\
    const safeName = spec.name.replace(/[[\]:*?/\\]/g, '-').slice(0, 31)
    const sheet = workbook.addWorksheet(safeName, {
      views: [{ state: 'frozen', ySplit: (spec.notes?.length ?? 0) + 1 }],
    })

    for (const note of spec.notes ?? []) {
      const row = sheet.addRow([note])
      row.font = { size: 10, italic: true, color: { argb: 'FF667186' } }
    }

    const headerRow = sheet.addRow(spec.columns.map((c) => c.header))
    headerRow.font = { bold: true, size: 10 }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    headerRow.alignment = { vertical: 'middle', wrapText: true }
    headerRow.border = { bottom: { style: 'thin', color: { argb: 'FFCBD1DA' } } }

    for (const record of spec.rows) {
      const row = sheet.addRow(spec.columns.map((c) => record[c.key] ?? null))
      spec.columns.forEach((column, index) => {
        const cell = row.getCell(index + 1)
        cell.numFmt = NUMBER_FORMATS[column.format ?? 'text']
        if (column.format && ['money', 'money2', 'percent', 'number'].includes(column.format)) {
          cell.alignment = { horizontal: 'right' }
        }
      })
    }

    if (spec.totalsRow && spec.rows.length > 0) {
      const totals = spec.columns.map((column, index) => {
        if (index === 0) return 'Total'
        if (!column.total) return null
        return spec.rows.reduce((sum, record) => {
          const value = record[column.key]
          return sum + (typeof value === 'number' && isFinite(value) ? value : 0)
        }, 0)
      })
      const row = sheet.addRow(totals)
      row.font = { bold: true }
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } }
      row.border = { top: { style: 'medium', color: { argb: 'FFCBD1DA' } } }
      spec.columns.forEach((column, index) => {
        const cell = row.getCell(index + 1)
        cell.numFmt = NUMBER_FORMATS[column.format ?? 'text']
        if (column.format && ['money', 'money2', 'percent', 'number'].includes(column.format)) {
          cell.alignment = { horizontal: 'right' }
        }
      })
    }

    spec.columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width ?? Math.max(12, Math.min(40, column.header.length + 4))
    })

    if (spec.rows.length > 0) {
      sheet.autoFilter = {
        from: { row: (spec.notes?.length ?? 0) + 1, column: 1 },
        to: { row: (spec.notes?.length ?? 0) + 1, column: spec.columns.length },
      }
    }
  }

  return workbook
}

export async function workbookResponse(workbook: ExcelJS.Workbook, filename: string): Promise<Response> {
  const buffer = await workbook.xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ── Reading ───────────────────────────────────────────────────────────────

export interface ParsedRow {
  rowNumber: number
  values: Record<string, string | number | Date | null>
}

/**
 * Reads the first worksheet into objects keyed by the header row, normalising
 * headers to lowercase so an import template survives someone re-typing a title.
 */
export async function parseWorkbook(buffer: ArrayBuffer): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return { headers: [], rows: [] }

  const headerRow = sheet.getRow(1)
  const headers: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell, index) => {
    headers[index - 1] = String(cell.value ?? '').trim().toLowerCase()
  })

  const rows: ParsedRow[] = []
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const values: ParsedRow['values'] = {}
    let hasValue = false
    headers.forEach((header, index) => {
      if (!header) return
      const raw = row.getCell(index + 1).value
      let value: string | number | Date | null = null
      if (raw == null) value = null
      else if (typeof raw === 'number' || typeof raw === 'string') value = raw
      else if (raw instanceof Date) value = raw
      else if (typeof raw === 'object' && 'result' in raw) value = (raw.result as string | number) ?? null
      else if (typeof raw === 'object' && 'text' in raw) value = String(raw.text)
      else value = String(raw)
      if (value !== null && value !== '') hasValue = true
      values[header] = value
    })
    if (hasValue) rows.push({ rowNumber, values })
  })

  return { headers: headers.filter(Boolean), rows }
}

export function asNumber(value: string | number | Date | null | undefined): number {
  if (typeof value === 'number') return isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
    const parsed = Number(cleaned)
    return isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function asDate(value: string | number | Date | null | undefined): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof value === 'number') {
    // Excel serial date: days since 1899-12-30
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
  }
  return null
}

export function asText(value: string | number | Date | null | undefined): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}
