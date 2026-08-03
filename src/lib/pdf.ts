import 'server-only'

/**
 * PDF generation.
 *
 * Written directly rather than pulled from a library: the documents this system
 * produces are financial reports and AIA certificates — tables of figures with a
 * header and a totals row — and a hand-built writer keeps them typographically
 * consistent with the rest of the app, embeds no fonts beyond the PDF base 14,
 * and adds no dependency for something this bounded.
 *
 * Output is a valid PDF 1.4 with Helvetica, correct cross-reference table and
 * proper page breaks with repeating headers.
 */

const PAGE = { width: 792, height: 612 } // US Letter, landscape — financial tables are wide
const MARGIN = { top: 48, right: 36, bottom: 44, left: 36 }
const LINE_HEIGHT = 13
const HEADER_HEIGHT = 18

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
  /** Label/value pairs rendered in two columns — used for certificate summaries. */
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
    .replace(/[—–]/g, '-')
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

// ── Document builder ──────────────────────────────────────────────────────

export function buildPdf(doc: PdfDocument): Buffer {
  const contentWidth = PAGE.width - MARGIN.left - MARGIN.right
  const pages: ContentStream[] = []
  let page = new ContentStream()
  let y = 0
  let pageNumber = 0

  const startPage = () => {
    if (pageNumber > 0) pages.push(page)
    page = new ContentStream()
    pageNumber++
    y = PAGE.height - MARGIN.top

    // Running header on every page after the first.
    if (pageNumber > 1) {
      page.text(fit(doc.title, contentWidth * 0.7, 9), MARGIN.left, y + 14, 9, { gray: 0.45 })
      page.rightText(`Page ${pageNumber}`, PAGE.width - MARGIN.right, y + 14, 9, { gray: 0.45 })
      page.line(MARGIN.left, y + 8, PAGE.width - MARGIN.right, y + 8, 0.85)
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
  page.line(MARGIN.left, y, PAGE.width - MARGIN.right, y, 0.6, 1)
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

    // Label/value pairs — the certificate summary form.
    if (section.pairs) {
      const labelWidth = contentWidth * 0.62
      for (const pair of section.pairs) {
        ensureSpace(LINE_HEIGHT + 2)
        if (pair.emphasis) page.rect(MARGIN.left - 3, y - 3.5, contentWidth + 6, LINE_HEIGHT + 1, 0.93)
        page.text(fit(pair.label, labelWidth, 9), MARGIN.left, y, 9, { bold: pair.emphasis, gray: pair.emphasis ? 0 : 0.25 })
        page.rightText(fit(pair.value, contentWidth - labelWidth, 9), PAGE.width - MARGIN.right, y, 9, { bold: pair.emphasis })
        y -= LINE_HEIGHT + 1
      }
      y -= 8
    }

    // Tables.
    if (section.table) {
      const { columns, rows, totals } = section.table
      const totalWidth = columns.reduce((a, c) => a + c.width, 0)
      const scale = contentWidth / totalWidth

      const x = (index: number) =>
        MARGIN.left + columns.slice(0, index).reduce((a, c) => a + c.width * scale, 0)
      const colWidth = (index: number) => columns[index].width * scale

      const drawHeader = () => {
        page.rect(MARGIN.left, y - 4, contentWidth, HEADER_HEIGHT, 0.93)
        columns.forEach((column, index) => {
          const label = fit(column.header, colWidth(index) - 8, 8)
          if (column.align === 'right') {
            page.rightText(label, x(index) + colWidth(index) - 4, y, 8, { bold: true, gray: 0.3 })
          } else {
            page.text(label, x(index) + 4, y, 8, { bold: true, gray: 0.3 })
          }
        })
        y -= HEADER_HEIGHT
      }

      ensureSpace(HEADER_HEIGHT + LINE_HEIGHT * 3)
      drawHeader()

      for (const row of rows) {
        if (y - LINE_HEIGHT < MARGIN.bottom) {
          startPage()
          drawHeader()
        }
        columns.forEach((column, index) => {
          const value = fit(row[column.key] ?? '', colWidth(index) - 8, 8.5)
          if (column.align === 'right') {
            page.rightText(value, x(index) + colWidth(index) - 4, y, 8.5)
          } else {
            page.text(value, x(index) + 4, y, 8.5)
          }
        })
        page.line(MARGIN.left, y - 4, PAGE.width - MARGIN.right, y - 4, 0.9)
        y -= LINE_HEIGHT
      }

      if (totals) {
        ensureSpace(LINE_HEIGHT + 8)
        page.line(MARGIN.left, y + 8, PAGE.width - MARGIN.right, y + 8, 0.45, 1)
        columns.forEach((column, index) => {
          const value = fit(totals[column.key] ?? '', colWidth(index) - 8, 8.5)
          if (column.align === 'right') {
            page.rightText(value, x(index) + colWidth(index) - 4, y, 8.5, { bold: true })
          } else {
            page.text(value, x(index) + 4, y, 8.5, { bold: true })
          }
        })
        y -= LINE_HEIGHT
      }

      y -= 16
    }
  }

  // Footer on every page.
  pages.push(page)
  const footerText = doc.footer ?? 'Generated by ConstructX'
  pages.forEach((p, index) => {
    p.line(MARGIN.left, MARGIN.bottom - 10, PAGE.width - MARGIN.right, MARGIN.bottom - 10, 0.85)
    p.text(fit(footerText, PAGE.width * 0.6, 8), MARGIN.left, MARGIN.bottom - 22, 8, { gray: 0.5 })
    p.rightText(`Page ${index + 1} of ${pages.length}`, PAGE.width - MARGIN.right, MARGIN.bottom - 22, 8, { gray: 0.5 })
  })

  return assemble(pages, doc.title)
}

/** Writes the PDF object graph with a correct cross-reference table. */
function assemble(pages: ContentStream[], title: string): Buffer {
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
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] ` +
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
