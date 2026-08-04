import { describe, expect, it } from 'vitest'
import { buildPdf } from './pdf'

/**
 * The PDF writer is hand-built, so these tests check the things a library would
 * otherwise guarantee: a parseable file, correct cross-reference offsets, and
 * every page accounted for.
 */

function parse(buffer: Buffer) {
  const text = buffer.toString('latin1')
  const startxref = Number(/startxref\s+(\d+)/.exec(text)?.[1])
  const tail = text.slice(startxref).split('\n')
  const count = Number(tail[1].split(' ')[1])
  const offsets = tail
    .slice(2, 2 + count)
    .map((line) => Number(line.split(' ')[0]))
    .slice(1) // entry 0 is the free-list head
  return { text, startxref, count, offsets }
}

const table = (rows: number) => ({
  columns: [
    { header: 'Code', key: 'code', width: 90 },
    { header: 'Description', key: 'description', width: 420 },
    { header: 'Amount', key: 'amount', width: 200, align: 'right' as const },
  ],
  rows: Array.from({ length: rows }, (_, i) => ({
    code: `01-${String(i).padStart(3, '0')}`,
    description: `Line ${i}`,
    amount: `$${i * 100}`,
  })),
  totals: { code: 'Total', amount: '$1,000' },
})

describe('pdf writer', () => {
  it('writes a parseable PDF with a correct cross-reference table', () => {
    const buffer = buildPdf({
      title: 'Report',
      sections: [{ heading: 'Detail', table: table(5) }],
    })

    expect(buffer.subarray(0, 8).toString()).toBe('%PDF-1.4')
    expect(buffer.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true)

    const { text, offsets } = parse(buffer)
    // Every xref offset must land exactly on an object header.
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 24)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })

  it('paginates long tables and declares every page it wrote', () => {
    const buffer = buildPdf({ title: 'Long', sections: [{ heading: 'Detail', table: table(400) }] })
    const text = buffer.toString('latin1')

    const pageObjects = (text.match(/\/Type \/Page[^s]/g) ?? []).length
    const kidsCount = Number(/\/Type \/Pages[\s\S]*?\/Count (\d+)/.exec(text)?.[1])

    expect(pageObjects).toBeGreaterThan(1)
    expect(kidsCount).toBe(pageObjects)
  })

  it('repeats the column headers on every page', () => {
    const buffer = buildPdf({ title: 'Long', sections: [{ heading: 'Detail', table: table(400) }] })
    const text = buffer.toString('latin1')
    const pages = (text.match(/\/Type \/Page[^s]/g) ?? []).length
    // "Description" appears once per page as a header, and never in the body rows.
    expect((text.match(/\(Description\)/g) ?? []).length).toBe(pages)
  })

  it('escapes the characters that would otherwise terminate a PDF string', () => {
    const buffer = buildPdf({
      title: 'Escapes',
      sections: [{ paragraphs: ['A (parenthetical) with a \\ backslash'] }],
    })
    const text = buffer.toString('latin1')
    expect(text).toContain('\\(parenthetical\\)')
    expect(text).toContain('\\\\')
  })

  it('folds typographic characters to ASCII rather than emitting raw bytes', () => {
    const buffer = buildPdf({
      title: 'Typography',
      sections: [{ paragraphs: ['Cost, “quoted” · 4×4 ÷ 2'] }],
    })
    const text = buffer.toString('latin1')
    // Streams are uncompressed, so any survivor would be visible here.
    const streams = text.split('stream').slice(1).join('stream')
    expect(/[^\x00-\x7F]/.test(streams)).toBe(false)
  })

  it('renders label/value pairs, which is what makes a G702 certificate readable', () => {
    const buffer = buildPdf({
      title: 'Application 3',
      sections: [
        {
          heading: 'Certificate',
          pairs: [
            { label: '1. Original contract sum', value: '$2,450,000' },
            { label: '8. CURRENT PAYMENT DUE', value: '$212,000', emphasis: true },
          ],
        },
      ],
    })
    const text = buffer.toString('latin1')
    expect(text).toContain('CURRENT PAYMENT DUE')
    expect(text).toContain('$2,450,000')
  })

  it('never truncates a money column, however many columns the report has', () => {
    // The shape that broke: seventeen columns of a job-cost schedule.
    const columns = [
      { header: 'Job', key: 'job', width: 12 },
      { header: 'Project', key: 'project', width: 26 },
      { header: 'Line item', key: 'code', width: 14 },
      { header: 'Description', key: 'description', width: 32 },
      ...Array.from({ length: 13 }, (_, i) => ({
        header: `Money column ${i}`,
        key: `m${i}`,
        width: 14,
        align: 'right' as const,
      })),
    ]
    const row: Record<string, string> = {
      job: '26-001',
      project: 'Riverside Medical Office Building',
      code: '03-300',
      description: 'Cast-in-place concrete, footings and foundation walls',
    }
    for (let i = 0; i < 13; i++) row[`m${i}`] = '($1,234,567)'

    const buffer = buildPdf({ title: 'Wide', sections: [{ table: { columns, rows: [row, row, row], totals: { job: 'Total (3)' } } }] })
    const drawn = [...buffer.toString('latin1').matchAll(/\((.*?)\) Tj/g)].map((m) => m[1])

    // Every money cell must survive whole.
    const moneyCells = drawn.filter((s) => s.includes('1,234,567') || s.startsWith('\\($1'))
    expect(moneyCells.length).toBe(39)
    for (const cell of moneyCells) expect(cell).not.toContain('...')

    // And the totals label is not cut down to nothing.
    // Parentheses are escaped inside a PDF literal string.
    expect(drawn).toContain('Total \\(3\\)')
  })

  it('does not lose a cell to floating-point rounding when it measures exactly', () => {
    // "$62.00" measures 25.993pt at 8.5pt. Storing that as width + padding and
    // subtracting the padding back at render time returned 25.992999999999995,
    // one bit short, and the cell was truncated to "$62....".
    const value = '$62.00'
    const buffer = buildPdf({
      title: 'Boundary',
      sections: [
        {
          table: {
            columns: [
              { header: 'Rate', key: 'rate', width: 14, align: 'right' },
              { header: 'Item', key: 'item', width: 40 },
            ],
            rows: [{ rate: value, item: 'Anything' }],
          },
        },
      ],
    })
    const drawn = [...buffer.toString('latin1').matchAll(/\((.*?)\) Tj/g)].map((m) => m[1])
    expect(drawn).toContain(value)
  })

  it('grows the sheet rather than shrinking figures away', () => {
    const narrow = buildPdf({
      title: 'Narrow',
      sections: [{ table: { columns: [{ header: 'A', key: 'a', width: 10 }], rows: [{ a: 'x' }] } }],
    })
    const wide = buildPdf({
      title: 'Wide',
      sections: [
        {
          table: {
            columns: Array.from({ length: 20 }, (_, i) => ({ header: `Column ${i}`, key: `k${i}`, width: 14, align: 'right' as const })),
            rows: [Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, '$12,345,678']))],
          },
        },
      ],
    })
    const box = (b: Buffer) => Number(/\/MediaBox \[0 0 (\d+)/.exec(b.toString('latin1'))![1])
    expect(box(narrow)).toBe(792) // letter landscape when it fits
    expect(box(wide)).toBeGreaterThan(792) // widened rather than truncated
  })

  it('keeps the totals row with its table instead of orphaning it', () => {
    // Enough rows to land the totals right at a page boundary.
    for (const count of [33, 34, 35, 36, 37]) {
      const buffer = buildPdf({ title: 'Boundary', sections: [{ heading: 'D', table: table(count) }] })
      const drawn = [...buffer.toString('latin1').matchAll(/\((.*?)\) Tj/g)].map((m) => m[1])
      expect(drawn).toContain('Total')
    }
  })

  it('produces a valid document for an empty table rather than failing', () => {
    const buffer = buildPdf({
      title: 'Nothing to report',
      sections: [{ heading: 'Detail', table: { columns: table(0).columns, rows: [] } }],
    })
    expect(buffer.subarray(0, 8).toString()).toBe('%PDF-1.4')
    const { offsets, text } = parse(buffer)
    expect(offsets.length).toBeGreaterThan(0)
    offsets.forEach((offset, index) => {
      expect(text.slice(offset, offset + 24)).toMatch(new RegExp(`^${index + 1} 0 obj`))
    })
  })
})
