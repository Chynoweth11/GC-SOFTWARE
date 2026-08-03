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
      sections: [{ paragraphs: ['Cost — “quoted” · 4×4 ÷ 2'] }],
    })
    const text = buffer.toString('latin1')
    // Streams are uncompressed, so any survivor would be visible here.
    const streams = text.split('stream').slice(1).join('stream')
    // eslint-disable-next-line no-control-regex -- asserting the absence of non-ASCII
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
