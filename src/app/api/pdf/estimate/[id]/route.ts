import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { buildEstimateSheets } from '@/lib/queries/estimate-spec'
import { sheetsToPdf } from '@/lib/pdf-report'
import { buildPdf, pdfResponse } from '@/lib/pdf'
import { date } from '@/lib/format'

/** Estimate as a PDF, rendered from the same spec as the workbook. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) return new Response('Not found', { status: 404 })

  const { estimate } = bundle
  const sheets = buildEstimateSheets(bundle, can(user.role, 'view:markups'))

  const document = buildPdf(
    sheetsToPdf(sheets, {
      title: `${estimate.name} — v${estimate.version}`,
      subtitle: 'Estimate and bid build-up',
      company: user.companyName,
      notes: [
        user.companyName,
        estimate.clientName ? `Client: ${estimate.clientName}` : 'No client on record',
        estimate.bidDueDate ? `Bid due ${date(estimate.bidDueDate)}` : `Generated ${date(new Date())}`,
      ],
    }),
  )
  return pdfResponse(document, `constructx-estimate-${estimate.name.replace(/\s+/g, '-')}.pdf`)
}
