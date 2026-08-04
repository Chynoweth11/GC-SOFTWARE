import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getProjectBundle } from '@/lib/queries/project'
import { buildG702 } from '@/lib/finance'
import { buildPdf, pdfResponse, type PdfDocument } from '@/lib/pdf'
import { date, money, percent } from '@/lib/format'

/**
 * The AIA G702 application and certificate for payment, with its G703
 * continuation sheet: laid out as the document an owner signs rather than as
 * a table dump, because this is the one export that leaves the company.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) return new Response('Not found', { status: 404 })

  const { project, financials: f, billings, sovLines } = bundle
  const applications = [...billings].sort((a, b) => a.appNumber - b.appNumber)
  if (applications.length === 0) return new Response('No pay applications on this project', { status: 404 })

  const requested = Number(request.nextUrl.searchParams.get('app'))
  const target = applications.find((a) => a.appNumber === requested) ?? applications[applications.length - 1]

  const g = buildG702(
    target,
    applications,
    sovLines,
    f.contract.originalContract,
    f.contract.approvedChangeOrders,
    f.dataDate,
  )

  const document: PdfDocument = {
    title: `Application and Certificate for Payment No. ${g.appNumber}`,
    subtitle: `${project.number} ${project.name}`,
    meta: [
      project.client?.name ? `Owner: ${project.client.name}` : '',
      `Period to ${date(g.periodTo)}`,
      `Contractor: ${user.companyName}`,
    ].filter(Boolean),
    sections: [
      {
        heading: 'Contractor’s application for payment',
        pairs: [
          { label: '1. Original contract sum', value: money(g.originalContract) },
          { label: '2. Net change by change orders', value: money(g.netChangeByChangeOrders) },
          { label: '3. Contract sum to date (line 1 ± 2)', value: money(g.contractSumToDate), emphasis: true },
          { label: '4. Total completed and stored to date', value: money(g.totalCompletedAndStored) },
          { label: `5. Retainage (${percent(g.retainagePct)})`, value: money(g.retainage) },
          { label: '6. Total earned less retainage (line 4 − 5)', value: money(g.totalEarnedLessRetainage) },
          { label: '7. Less previous certificates for payment', value: money(g.lessPreviousCertificates) },
          { label: '8. CURRENT PAYMENT DUE (line 6 − 7)', value: money(g.currentPaymentDue), emphasis: true },
          { label: '9. Balance to finish including retainage (line 3 − 6)', value: money(g.balanceToFinishIncludingRetainage) },
        ],
      },
      {
        heading: 'Status of this application',
        pairs: [
          { label: 'Percent complete', value: percent(g.pctComplete) },
          { label: 'Amount collected against this application', value: money(g.amountPaid) },
          { label: 'Outstanding receivable', value: money(g.arOutstanding) },
          { label: 'Days outstanding', value: g.daysOutstanding == null ? '-' : String(g.daysOutstanding) },
          { label: 'Status', value: g.status },
        ],
      },
      {
        heading: 'Continuation sheet (G703)',
        subheading: `${g.lines.length} schedule-of-values line${g.lines.length === 1 ? '' : 's'}`,
        table: {
          columns: [
            { header: 'Item', key: 'number', width: 42 },
            { header: 'Description of work', key: 'description', width: 188 },
            { header: 'Scheduled value', key: 'scheduledValue', width: 74, align: 'right' },
            { header: 'From previous', key: 'fromPreviousApplication', width: 68, align: 'right' },
            { header: 'This period', key: 'workThisPeriod', width: 66, align: 'right' },
            { header: 'Stored', key: 'storedMaterials', width: 58, align: 'right' },
            { header: 'Completed and stored', key: 'totalCompletedAndStored', width: 78, align: 'right' },
            { header: '%', key: 'pctComplete', width: 42, align: 'right' },
            { header: 'Balance to finish', key: 'balanceToFinish', width: 68, align: 'right' },
            { header: 'Retainage', key: 'retainage', width: 56, align: 'right' },
          ],
          rows: g.lines.map((l) => ({
            number: l.number,
            description: l.description,
            scheduledValue: money(l.scheduledValue),
            fromPreviousApplication: money(l.fromPreviousApplication),
            workThisPeriod: money(l.workThisPeriod),
            storedMaterials: money(l.storedMaterials),
            totalCompletedAndStored: money(l.totalCompletedAndStored),
            pctComplete: percent(l.pctComplete, 0),
            balanceToFinish: money(l.balanceToFinish),
            retainage: money(l.retainage),
          })),
          totals: {
            number: 'Total',
            scheduledValue: money(g.contractSumToDate),
            fromPreviousApplication: money(g.lines.reduce((a, l) => a + l.fromPreviousApplication, 0)),
            workThisPeriod: money(g.lines.reduce((a, l) => a + l.workThisPeriod, 0)),
            storedMaterials: money(g.lines.reduce((a, l) => a + l.storedMaterials, 0)),
            totalCompletedAndStored: money(g.totalCompletedAndStored),
            pctComplete: percent(g.pctComplete, 0),
            balanceToFinish: money(g.lines.reduce((a, l) => a + l.balanceToFinish, 0)),
            retainage: money(g.retainage),
          },
        },
      },
      {
        heading: 'Certification',
        paragraphs: [
          'The undersigned Contractor certifies that to the best of the Contractor’s knowledge, information and belief the work covered by this Application for Payment has been completed in accordance with the Contract Documents, that all amounts have been paid by the Contractor for work for which previous Certificates for Payment were issued and payments received from the Owner, and that current payment shown herein is now due.',
          'Contractor signature: _________________________________    Date: ______________',
          'Architect certificate for payment: amount certified: _________________________',
          'Architect signature: __________________________________    Date: ______________',
        ],
      },
    ],
    footer: `${user.companyName} · ${project.number} application ${g.appNumber}`,
  }

  return pdfResponse(buildPdf(document), `constructx-${project.number}-app-${g.appNumber}.pdf`)
}
