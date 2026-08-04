import 'server-only'

/**
 * PDF generation.
 *
 * Written directly rather than pulled from a library. The documents this system
 * produces are financial reports and AIA certificates, tables of figures with a
 * header and a totals row, and a hand-built writer keeps them typographically
 * consistent with the rest of the app, embeds no fonts beyond the PDF base 14,
 * and adds no dependency for something this bounded.
 *
 * Output is a valid PDF 1.4 with Helvetica, correct cross-reference table and
 * proper page breaks with repeating headers.
 */

const PAGE_HEIGHT = 612 // US Letter, landscape
const BASE_PAGE_WIDTH = 792
/**
 * A seventeen-column job-cost schedule does not fit on letter landscape at a
 * legible size. Rather than truncate figures, the sheet grows to fit, up to this
 * cap. A PDF showing "$1,2..." where a cost belongs is worse than no PDF at all.
 * Every viewer and printer scales an oversized sheet down; none can recover a
 * digit that was thrown away.
 */
const MAX_PAGE_WIDTH = 2160
const MARGIN = { top: 48, right: 36, bottom: 44, left: 36 }
const LINE_HEIGHT = 13
const HEADER_HEIGHT = 18
const BODY_SIZE = 8.5
const COLUMN_HEADER_SIZE = 8
const CELL_PADDING = 8
/** Below this the figures stop being readable, so the sheet widens instead. */
const MIN_BODY_SIZE = 6.5
/** A text column may be squeezed this far; a numeric column never is. */
const MIN_TEXT_COLUMN = 46
/** A description does not need to be rendered in full to widen the whole sheet. */
const MAX_TEXT_COLUMN = 190

export type PdfAlign = 'left' | 'right'

export interface PdfColumn {
  header: string
  key: string
  width: number
  align?: PdfAlign
}

export interface PdfTable {
  columns: PdfColumn[]
  rows: Record<string, string>[]
  /** Rendered bold with a rule above, repeated on the final page only. */
  totals?: Record<string, string>
}

export interface PdfSection {
  heading?: string
  subheading?: string
  /** Label and value pairs in two columns, used for certificate summaries. */
  pairs?: { label: string; value: string; emphasis?: boolean }[]
  table?: PdfTable
  paragraphs?: string[]
}

export interface PdfDocument {
  title: string
  subtitle?: string
  meta?: string[]
  sections: PdfSection[]
  footer?: string
}

// ── Low-level PDF primitives ──────────────────────────────────────────────

/** Escapes the three characters that terminate a PDF literal string. */
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/**
 * Widths of Helvetica at 1pt, indexed by char code 32–126. Used to truncate a
 * cell to its column rather than letting it overrun the next one.
 */
const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

function textWidth(value: string, size: number): number {
  let total = 0
  for (const char of value) {
    const code = char.charCodeAt(0)
    total += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 556
  }
  return (total * size) / 1000
}

/** ASCII-folds and truncates so a cell never bleeds past its column. */
function fit(value: string, maxWidth: number, size: number): string {
  const clean = value
    .replace(/\u2014|\u2013/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, '-')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/−/g, '-')
    // Anything still outside printable ASCII would break the WinAnsi encoding.
    .replace(/[^\x20-\x7E]/g, '')

  if (textWidth(clean, size) <= maxWidth) return clean

  let truncated = clean
  while (truncated.length > 1 && textWidth(`${truncated}...`, size) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}...`
}

/** Wraps text to a width, for paragraphs. */
function wrap(value: string, maxWidth: number, size: number): string[] {
  const words = fit(value, Infinity, size).split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (textWidth(candidate, size) > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

class ContentStream {
  private parts: string[] = []

  text(value: string, x: number, y: number, size: number, options: { bold?: boolean; gray?: number } = {}) {
    const font = options.bold ? '/F2' : '/F1'
    const gray = options.gray ?? 0
    this.parts.push(
      `BT ${gray} g ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapeText(value)}) Tj ET`,
    )
  }

  rightText(value: string, right: number, y: number, size: number, options: { bold?: boolean; gray?: number } = {}) {
    this.text(value, right - textWidth(value, size), y, size, options)
  }

  line(x1: number, y1: number, x2: number, y2: number, gray = 0.75, width = 0.5) {
    this.parts.push(`${gray} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)
  }

  rect(x: number, y: number, w: number, h: number, gray = 0.94) {
    this.parts.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`)
  }

  toString(): string {
    return this.parts.join('\n')
  }
}

// ── Table layout ──────────────────────────────────────────────────────────

interface TableLayout {
  widths: number[]
  bodySize: number
  headerSize: number
}

/**
 * What each column actually needs: the widest of its header, its cells and its
 * total, plus padding. The `width` on PdfColumn is only a hint for the relative
 * feel of the table. Content decides, because a column of dollar figures has a
 * width it cannot go below without losing digits.
 */
function headerSizeFor(bodySize: number): number {
  return Math.min(COLUMN_HEADER_SIZE, bodySize)
}

function naturalWidths(table: PdfTable, bodySize: number): number[] {
  const headerSize = headerSizeFor(bodySize)
  return table.columns.map((column) => {
    let width = textWidth(fit(column.header, Infinity, headerSize), headerSize)
    for (const row of table.rows) {
      width = Math.max(width, textWidth(fit(row[column.key] ?? '', Infinity, bodySize), bodySize))
    }
    if (table.totals) {
      width = Math.max(width, textWidth(fit(table.totals[column.key] ?? '', Infinity, bodySize), bodySize))
    }
    // Rounded up to a quarter point. The renderer subtracts the same padding
    // back off before fitting each cell, and `w + 8 - 8` does not always return
    // w in binary floating point: a cell measured to fit was being judged one
    // bit too wide and truncated. Rounding up guarantees the space is there.
    return Math.ceil((width + CELL_PADDING) * 4) / 4
  })
}

/**
 * The width a table wants at full size, with long text columns allowed to be
 * clipped. A description can lose its tail; a dollar figure cannot.
 */
function preferredWidth(table: PdfTable): number {
  return naturalWidths(table, BODY_SIZE).reduce(
    (total, width, index) =>
      total + (table.columns[index].align === 'right' ? width : Math.min(width, MAX_TEXT_COLUMN)),
    0,
  )
}

/**
 * Picks one sheet width for the document: wide enough that every table renders
 * at full size, never below letter landscape and never above the cap. Only a
 * table that still does not fit at the cap has its type reduced.
 */
function planPageWidth(doc: PdfDocument): number {
  let required = 0
  for (const section of doc.sections) {
    if (!section.table || section.table.columns.length === 0) continue
    required = Math.max(required, preferredWidth(section.table) + MARGIN.left + MARGIN.right)
  }
  return Math.min(MAX_PAGE_WIDTH, Math.max(BASE_PAGE_WIDTH, Math.ceil(required)))
}

/**
 * Fits one table to the available width.
 *
 * Full size first; then progressively smaller type; then squeezing the text
 * columns, which can lose a few characters of a description harmlessly. Numeric
 * columns keep their natural width throughout, so a money value is never cut.
 */
function layoutTable(table: PdfTable, available: number): TableLayout {
  const sizes = [BODY_SIZE, 8, 7.5, 7, MIN_BODY_SIZE]

  for (const bodySize of sizes) {
    const widths = naturalWidths(table, bodySize).map((w, i) =>
      table.columns[i].align === 'right' ? w : Math.min(w, MAX_TEXT_COLUMN),
    )
    const total = widths.reduce((a, w) => a + w, 0)
    if (total <= available) {
      // Room to spare: give it to the text columns so the table fills the sheet.
      const flexible = table.columns.map((c, i) => (c.align === 'right' ? -1 : i)).filter((i) => i >= 0)
      if (flexible.length > 0 && total < available) {
        const share = (available - total) / flexible.length
        for (const i of flexible) widths[i] += share
      }
      return { widths, bodySize, headerSize: headerSizeFor(bodySize) }
    }
  }

  // Still too wide at the smallest type: squeeze the text columns only.
  const bodySize = MIN_BODY_SIZE
  const widths = naturalWidths(table, bodySize).map((w, i) =>
    table.columns[i].align === 'right' ? w : Math.min(w, MAX_TEXT_COLUMN),
  )
  const flexible = table.columns.map((c, i) => (c.align === 'right' ? -1 : i)).filter((i) => i >= 0)
  const fixed = widths.reduce((a, w, i) => a + (flexible.includes(i) ? 0 : w), 0)
  const flexNatural = widths.reduce((a, w, i) => a + (flexible.includes(i) ? w : 0), 0)
  const flexBudget = Math.max(flexible.length * MIN_TEXT_COLUMN, available - fixed)
  if (flexNatural > 0 && flexBudget < flexNatural) {
    const ratio = flexBudget / flexNatural
    for (const i of flexible) widths[i] = Math.max(MIN_TEXT_COLUMN, widths[i] * ratio)
  }
  return { widths, bodySize, headerSize: headerSizeFor(bodySize) }
}

// ── Document builder ──────────────────────────────────────────────────────

export function buildPdf(doc: PdfDocument): Buffer {
  const pageWidth = planPageWidth(doc)
  const contentWidth = pageWidth - MARGIN.left - MARGIN.right
  const pages: ContentStream[] = []
  let page = new ContentStream()
  let y = 0
  let pageNumber = 0

  const startPage = () => {
    if (pageNumber > 0) pages.push(page)
    page = new ContentStream()
    pageNumber++
    y = PAGE_HEIGHT - MARGIN.top

    // Running header on every page after the first.
    if (pageNumber > 1) {
      page.text(fit(doc.title, contentWidth * 0.7, 9), MARGIN.left, y + 14, 9, { gray: 0.45 })
      page.rightText(`Page ${pageNumber}`, pageWidth - MARGIN.right, y + 14, 9, { gray: 0.45 })
      page.line(MARGIN.left, y + 8, pageWidth - MARGIN.right, y + 8, 0.85)
    }
  }

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN.bottom) startPage()
  }

  startPage()

  // ── Title block ─────────────────────────────────────────────────────────
  page.text(fit(doc.title, contentWidth, 17), MARGIN.left, y, 17, { bold: true })
  y -= 20
  if (doc.subtitle) {
    page.text(fit(doc.subtitle, contentWidth, 10), MARGIN.left, y, 10, { gray: 0.4 })
    y -= 14
  }
  for (const line of doc.meta ?? []) {
    page.text(fit(line, contentWidth, 9), MARGIN.left, y, 9, { gray: 0.45 })
    y -= 11
  }
  y -= 6
  page.line(MARGIN.left, y, pageWidth - MARGIN.right, y, 0.6, 1)
  y -= 18

  // ── Sections ────────────────────────────────────────────────────────────
  for (const section of doc.sections) {
    if (section.heading) {
      ensureSpace(48)
      page.text(fit(section.heading, contentWidth, 11), MARGIN.left, y, 11, { bold: true })
      y -= 13
      if (section.subheading) {
        page.text(fit(section.subheading, contentWidth, 8.5), MARGIN.left, y, 8.5, { gray: 0.45 })
        y -= 12
      }
      y -= 4
    }

    for (const paragraph of section.paragraphs ?? []) {
      for (const line of wrap(paragraph, contentWidth, 9)) {
        ensureSpace(LINE_HEIGHT)
        page.text(line, MARGIN.left, y, 9, { gray: 0.2 })
        y -= LINE_HEIGHT
      }
      y -= 4
    }

    // Label/value pairs: the certificate summary form.
    if (section.pairs) {
      const labelWidth = contentWidth * 0.62
      for (const pair of section.pairs) {
        ensureSpace(LINE_HEIGHT + 2)
        if (pair.emphasis) page.rect(MARGIN.left - 3, y - 3.5, contentWidth + 6, LINE_HEIGHT + 1, 0.93)
        page.text(fit(pair.label, labelWidth, 9), MARGIN.left, y, 9, { bold: pair.emphasis, gray: pair.emphasis ? 0 : 0.25 })
        page.rightText(fit(pair.value, contentWidth - labelWidth, 9), pageWidth - MARGIN.right, y, 9, { bold: pair.emphasis })
        y -= LINE_HEIGHT + 1
      }
      y -= 8
    }

    // Tables.
    if (section.table && section.table.columns.length > 0) {
      const { columns, rows, totals } = section.table
      const { widths, bodySize, headerSize } = layoutTable(section.table, contentWidth)
      const tableWidth = widths.reduce((a, w) => a + w, 0)

      const x = (index: number) => MARGIN.left + widths.slice(0, index).reduce((a, w) => a + w, 0)

      const drawRow = (values: Record<string, string>, size: number, bold: boolean, gray?: number) => {
        columns.forEach((column, index) => {
          const value = fit(values[column.key] ?? '', widths[index] - CELL_PADDING, size)
          if (column.align === 'right') {
            page.rightText(value, x(index) + widths[index] - CELL_PADDING / 2, y, size, { bold, gray })
          } else {
            page.text(value, x(index) + CELL_PADDING / 2, y, size, { bold, gray })
          }
        })
      }

      const drawHeader = () => {
        page.rect(MARGIN.left, y - 4, tableWidth, HEADER_HEIGHT, 0.93)
        drawRow(Object.fromEntries(columns.map((c) => [c.key, c.header])), headerSize, true, 0.3)
        y -= HEADER_HEIGHT
      }

      ensureSpace(HEADER_HEIGHT + LINE_HEIGHT * 3)
      drawHeader()

      for (const row of rows) {
        if (y - LINE_HEIGHT < MARGIN.bottom) {
          startPage()
          drawHeader()
        }
        drawRow(row, bodySize, false)
        page.line(MARGIN.left, y - 4, MARGIN.left + tableWidth, y - 4, 0.9)
        y -= LINE_HEIGHT
      }

      if (totals) {
        // The totals row must never be orphaned onto a page without its table.
        if (y - (LINE_HEIGHT + 8) < MARGIN.bottom) {
          startPage()
          drawHeader()
        }
        page.line(MARGIN.left, y + 8, MARGIN.left + tableWidth, y + 8, 0.45, 1)
        drawRow(totals, bodySize, true)
        y -= LINE_HEIGHT
      }

      y -= 16
    }
  }

  // Footer on every page.
  pages.push(page)
  const footerText = doc.footer ?? 'Generated by ConstructX'
  pages.forEach((p, index) => {
    p.line(MARGIN.left, MARGIN.bottom - 10, pageWidth - MARGIN.right, MARGIN.bottom - 10, 0.85)
    p.text(fit(footerText, pageWidth * 0.6, 8), MARGIN.left, MARGIN.bottom - 22, 8, { gray: 0.5 })
    p.rightText(`Page ${index + 1} of ${pages.length}`, pageWidth - MARGIN.right, MARGIN.bottom - 22, 8, { gray: 0.5 })
  })

  return assemble(pages, doc.title, pageWidth)
}

/** Writes the PDF object graph with a correct cross-reference table. */
function assemble(pages: ContentStream[], title: string, pageWidth: number): Buffer {
  const objects: string[] = []
  const add = (body: string) => {
    objects.push(body)
    return objects.length // 1-indexed object number
  }

  const catalogId = 1
  const pagesId = 2
  const fontRegularId = 3
  const fontBoldId = 4
  objects.push('', '', '', '') // reserve 1–4

  objects[fontRegularId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  objects[fontBoldId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'

  const pageIds: number[] = []
  for (const page of pages) {
    const content = page.toString()
    const contentId = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`)
    const pageId = add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    )
    pageIds.push(pageId)
  }

  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`

  const infoId = add(
    `<< /Title (${escapeText(title)}) /Producer (ConstructX) /Creator (ConstructX) /CreationDate (D:${new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14)}Z) >>`,
  )

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets[index] = Buffer.byteLength(pdf, 'latin1')
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefOffset = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'latin1')
}

export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}"`,
      'Cache-Control': 'no-store',
    },
  })
}
