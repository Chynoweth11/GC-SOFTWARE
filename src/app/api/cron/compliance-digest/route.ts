import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getCompanyCompliance } from '@/lib/queries/labor'
import { buildComplianceDigest, type DigestRow } from '@/lib/finance'
import { mailConfig, sendMail } from '@/lib/mail'

/**
 * The compliance reminder, sent by mail.
 *
 * Called by a scheduler rather than by a person: Vercel Cron, a GitHub Actions
 * schedule, or any cron that can make an HTTPS request. Which one does not
 * matter, and that is the point of doing it this way rather than running a
 * timer inside the app, where a deploy or a restart would quietly stop it.
 *
 *   0 13 * * 1-5   curl -H "Authorization: Bearer $CRON_SECRET" \
 *                       https://your-host/api/cron/compliance-digest
 *
 * Protected by CRON_SECRET, compared in constant time. Without that variable
 * set the route refuses every call, because an unauthenticated endpoint that
 * emails a company's compliance position to a list of addresses is not
 * something to leave open by accident.
 *
 * Nothing is sent when nothing is outstanding. A daily mail that usually says
 * "all clear" gets filtered within a fortnight, and then the one that matters
 * is filtered with it.
 */

export const dynamic = 'force-dynamic'

/** Compares two secrets without leaking their length through timing. */
function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < given.length; index++) {
    difference |= given.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return Response.json(
      { error: 'CRON_SECRET is not set, so this endpoint is closed.' },
      { status: 503 },
    )
  }

  const header = request.headers.get('authorization') ?? ''
  const given = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!given || !sameSecret(given, secret)) {
    return Response.json({ error: 'Not authorised.' }, { status: 401 })
  }

  const config = mailConfig()
  if (!config.configured) {
    return Response.json(
      {
        sent: 0,
        skipped: 'mail is not configured',
        missing: config.missing,
      },
      { status: 200 },
    )
  }

  const baseUrl = process.env.APP_URL ?? null
  const companies = await prisma.company.findMany({ select: { id: true, name: true } })

  const results: { company: string; recipients: number; sent: boolean; reason?: string }[] = []

  for (const company of companies) {
    const compliance = await getCompanyCompliance(company.id)

    const rows: DigestRow[] = compliance.rows.map((entry) => ({
      projectNumber: entry.projectNumber,
      projectName: entry.projectName,
      title: entry.row.requirement.title,
      agency: entry.row.requirement.agency ?? null,
      status: entry.row.status,
      nextDueDate: entry.row.nextDueDate,
      daysUntilDue: entry.row.daysUntilDue,
      missedCount: entry.row.missedDueDates.length,
    }))

    const digest = buildComplianceDigest(rows, baseUrl ?? undefined)
    if (!digest.worthSending) {
      results.push({ company: company.name, recipients: 0, sent: false, reason: 'nothing outstanding' })
      continue
    }

    /*
      Who hears about it.

      Everyone who could act on a filing, which is everyone whose role may edit
      wage rates and compliance. Reading the capability rather than naming roles
      means a role added later is included without anybody remembering to come
      back here.
    */
    const staff = await prisma.user.findMany({
      where: { companyId: company.id, active: true },
      select: { email: true, role: true },
    })
    const recipients = staff.filter((person) => can(person.role, 'edit:wage_rates')).map((person) => person.email)

    if (recipients.length === 0) {
      results.push({ company: company.name, recipients: 0, sent: false, reason: 'nobody to tell' })
      continue
    }

    const outcome = await sendMail({
      to: recipients,
      subject: `${company.name}: ${digest.subject}`,
      text: digest.text,
      html: digest.html,
    })

    results.push({
      company: company.name,
      recipients: recipients.length,
      sent: outcome.sent,
      reason: outcome.error,
    })
  }

  const sent = results.filter((result) => result.sent).length
  return Response.json({ sent, provider: config.provider, results })
}
