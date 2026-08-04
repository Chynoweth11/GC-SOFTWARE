import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getProjectBundle } from '@/lib/queries/project'
import { buildG702 } from '@/lib/finance'
import { buildWorkbook, workbookResponse } from '@/lib/excel'

/** AIA G702/G703 export for one pay application. */
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

  const g702 = buildG702(
    target,
    applications,
    sovLines,
    f.contract.originalContract,
    f.contract.approvedChangeOrders,
    f.dataDate,
  )

  const workbook = buildWorkbook(
    [
      {
        name: 'G702 certificate',
        notes: [
          `${project.number}: ${project.name}`,
          `Application ${g702.appNumber} · period to ${g702.periodTo.toISOString().slice(0, 10)}`,
          project.client?.name ? `Owner: ${project.client.name}` : '',
        ].filter(Boolean),
        columns: [
          { header: 'Line', key: 'line', width: 42 },
          { header: 'Amount', key: 'amount', format: 'money2', width: 20 },
        ],
        rows: [
          { line: '1. Original contract sum', amount: g702.originalContract },
          { line: '2. Net change by change orders', amount: g702.netChangeByChangeOrders },
          { line: '3. Contract sum to date', amount: g702.contractSumToDate },
          { line: '4. Total completed and stored to date', amount: g702.totalCompletedAndStored },
          { line: `5. Retainage (${(g702.retainagePct * 100).toFixed(1)}%)`, amount: g702.retainage },
          { line: '6. Total earned less retainage', amount: g702.totalEarnedLessRetainage },
          { line: '7. Less previous certificates for payment', amount: g702.lessPreviousCertificates },
          { line: '8. CURRENT PAYMENT DUE', amount: g702.currentPaymentDue },
          { line: '9. Balance to finish including retainage', amount: g702.balanceToFinishIncludingRetainage },
          { line: 'Amount collected against this application', amount: g702.amountPaid },
          { line: 'Outstanding receivable', amount: g702.arOutstanding },
        ],
      },
      {
        name: 'G703 continuation',
        totalsRow: true,
        columns: [
          { header: 'Item', key: 'number', width: 10 },
          { header: 'Description of work', key: 'description', width: 40 },
          { header: 'Scheduled value', key: 'scheduledValue', format: 'money', total: true },
          { header: 'From previous application', key: 'fromPreviousApplication', format: 'money', total: true },
          { header: 'This period', key: 'workThisPeriod', format: 'money', total: true },
          { header: 'Stored materials', key: 'storedMaterials', format: 'money', total: true },
          { header: 'Total completed and stored', key: 'totalCompletedAndStored', format: 'money', total: true },
          { header: '%', key: 'pctComplete', format: 'percent' },
          { header: 'Balance to finish', key: 'balanceToFinish', format: 'money', total: true },
          { header: 'Retainage', key: 'retainage', format: 'money', total: true },
        ],
        rows: g702.lines as unknown as Record<string, string | number>[],
      },
    ],
    { title: `Application ${g702.appNumber}`, company: user.companyName },
  )

  return workbookResponse(workbook, `constructx-${project.number}-app-${g702.appNumber}.xlsx`)
}
