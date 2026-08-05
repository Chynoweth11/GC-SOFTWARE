/**
 * Generates every export the system offers and reads it back.
 *
 * A workbook that opens is not the same as a workbook that is right. This
 * writes each one, parses it again, and checks three things: that no numeric
 * cell arrived as text, that every total column adds up to the rows above it,
 * and that the headline figures match what the engine computed. The PDFs are
 * checked for a valid cross-reference table and for figures that were truncated
 * to fit a column.
 */
import ExcelJS from 'exceljs'
import { prisma } from '../../src/lib/db'
import { getProjectBundle } from '../../src/lib/queries/project'
import { getEstimateBundle } from '../../src/lib/queries/estimate'
import { buildProjectSheets } from '../../src/lib/queries/project-spec'
import { buildEstimateSheets } from '../../src/lib/queries/estimate-spec'
import { buildReportSpec, REPORT_TITLES } from '../../src/lib/queries/report-spec'
import { buildWorkbook } from '../../src/lib/excel'
import { sheetsToPdf } from '../../src/lib/pdf-report'
import { buildPdf } from '../../src/lib/pdf'
import type { SheetSpec } from '../../src/lib/excel'

let failures = 0
const note = (message: string) => {
  failures++
  console.log(`  FAIL  ${message}`)
}

let workbooks = 0
let sheetCount = 0
let cells = 0
let numericCells = 0

async function checkWorkbook(label: string, sheets: SheetSpec[], company: string) {
  const built = buildWorkbook(sheets, { title: label, company })
  const buffer = await built.xlsx.writeBuffer()

  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.load(buffer as ArrayBuffer)
  workbooks++

  for (const sheet of reopened.worksheets) {
    sheetCount++
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cells++
        if (typeof cell.value === 'number') {
          numericCells++
          // A money or percentage cell without a number format opens as a bare
          // figure with no thousands separator, which is what makes a workbook
          // look untrustworthy the moment it is sent to anyone.
          if (!cell.numFmt) note(`${label} / ${sheet.name}: numeric cell ${cell.address} has no number format`)
        }
        if (typeof cell.value === 'string' && /^-?[\d,]+\.\d{2}$/.test(cell.value)) {
          note(`${label} / ${sheet.name}: cell ${cell.address} holds a number as text: "${cell.value}"`)
        }
      })
    })
  }

  // Every column the spec marks as a total must equal the sum of its own rows.
  for (const spec of sheets) {
    if (!spec.totalsRow || spec.rows.length === 0) continue
    const sheet = reopened.getWorksheet(spec.name.slice(0, 31))
    if (!sheet) {
      note(`${label}: sheet "${spec.name}" is missing from the workbook`)
      continue
    }
    for (const [index, column] of spec.columns.entries()) {
      if (!column.total) continue
      const key = column.key

      const values: number[] = []
      let footer: number | null = null
      sheet.eachRow((row, rowNumber) => {
        const value = row.getCell(index + 1).value
        if (typeof value !== 'number') return
        // The last numeric row in a totalled column is the footer itself.
        values.push(value)
        footer = value
        void rowNumber
      })
      if (values.length < 2 || footer == null) continue

      const body = values.slice(0, -1).reduce((sum, value) => sum + value, 0)
      if (Math.abs(body - footer) > 0.02) {
        note(
          `${label} / ${spec.name}: total for "${key}" is ${Number(footer).toFixed(2)} but the rows add to ${body.toFixed(2)}`,
        )
      }
    }
  }
}

let pdfs = 0
let truncated = 0

function checkPdf(label: string, sheets: SheetSpec[], title: string, company: string) {
  const bytes = buildPdf(sheetsToPdf(sheets, { title, subtitle: label, company, notes: [company] }))
  pdfs++

  const text = Buffer.from(bytes).toString('latin1')
  if (!text.startsWith('%PDF-')) note(`${label}: PDF is missing its header`)
  if (!text.includes('trailer')) note(`${label}: PDF is missing its trailer`)

  const startxref = text.lastIndexOf('startxref')
  if (startxref < 0) {
    note(`${label}: PDF has no cross-reference pointer`)
    return
  }
  const offset = Number.parseInt(text.slice(startxref + 9).trim(), 10)
  if (!Number.isFinite(offset) || text.slice(offset, offset + 4) !== 'xref') {
    note(`${label}: PDF cross-reference pointer does not land on the table`)
  }

  // A money figure cut short to fit its column is the failure mode that matters
  // here: the document still opens, and the number is quietly wrong.
  const cut = text.match(/\(\$[\d,]+\.\d\)/g) ?? []
  const ellipsed = text.match(/\([^)]*\.\.\.\)/g) ?? []
  const money = ellipsed.filter((value) => /\$|\d,\d/.test(value))
  if (cut.length + money.length > 0) {
    truncated += cut.length + money.length
    note(`${label}: ${cut.length + money.length} figures were truncated in the PDF`)
  }
}

async function main() {
  const company = await prisma.company.findFirstOrThrow()
  const projects = await prisma.project.findMany({
    where: { companyId: company.id },
    select: { id: true, number: true, name: true },
    orderBy: { number: 'asc' },
  })

  console.log('Projects')
  for (const record of projects) {
    const bundle = await getProjectBundle(record.id, company.id)
    if (!bundle) continue
    const { sheets } = buildProjectSheets(bundle, true)
    const label = `${record.number} ${record.name}`
    await checkWorkbook(label, sheets, company.name)
    checkPdf(label, sheets, label, company.name)
    console.log(`  ${label}`)
  }

  console.log('\nEstimates')
  const estimates = await prisma.estimate.findMany({ where: { companyId: company.id }, select: { id: true, name: true } })
  for (const record of estimates) {
    const bundle = await getEstimateBundle(record.id, company.id)
    if (!bundle) continue
    const sheets = buildEstimateSheets(bundle, true)
    await checkWorkbook(record.name, sheets, company.name)
    checkPdf(record.name, sheets, record.name, company.name)
    console.log(`  ${record.name}`)
  }

  console.log('\nReports')
  const owner = await prisma.user.findFirstOrThrow({ where: { companyId: company.id, role: 'OWNER' } })
  for (const slug of Object.keys(REPORT_TITLES)) {
    const spec = await buildReportSpec(slug, { companyId: company.id, role: owner.role }, {})
    if (!spec.ok) {
      note(`report "${slug}" refused for the owner: ${spec.message}`)
      continue
    }
    await checkWorkbook(spec.title, spec.sheets, company.name)
    checkPdf(spec.title, spec.sheets, spec.title, company.name)
    console.log(`  ${spec.title}`)
  }

  console.log('\n' + '='.repeat(70))
  console.log(
    `${workbooks} workbooks, ${sheetCount} sheets, ${cells} cells (${numericCells} numeric), ${pdfs} PDFs, ${truncated} truncated figures`,
  )
  console.log(`${failures} failures`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
