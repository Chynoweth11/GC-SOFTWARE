import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { deadlinesThrough, deriveCompliance, today } from '@/lib/finance'

/**
 * Every compliance deadline as a calendar feed.
 *
 * This is the reminder mechanism, and it is a deliberate choice. Sending mail
 * would need a mail transport this system does not have and an address list to
 * keep correct; a calendar subscription needs neither, works on a phone the
 * moment it is added, and puts the deadline where the person already looks.
 * Outlook, Google Calendar and Apple Calendar all take this URL directly.
 *
 * Two alarms are attached to each event, at the requirement's own lead time and
 * again on the morning it is due, so the reminder arrives before the deadline
 * rather than as a note that it has passed.
 *
 * The feed carries the deadlines actually outstanding plus a year ahead. A
 * deadline already answered by a filing is not in it, so a subscribed calendar
 * empties itself as the work is done.
 */

/** Escapes the characters iCalendar treats as structure. */
function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** A date with no time, which is what a filing deadline is. */
function dateStamp(value: Date): string {
  return value.toISOString().slice(0, 10).replace(/-/g, '')
}

function timestamp(value: Date): string {
  return `${value.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`
}

/**
 * Folds a line to 75 octets, which the specification requires and which some
 * calendar clients enforce strictly enough to reject the whole feed over.
 */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }
  if (rest) parts.push(` ${rest}`)
  return parts.join('\r\n')
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!can(user.role, 'view:wage_rates')) return new Response('Forbidden', { status: 403 })

  const requirements = await prisma.complianceRequirement.findMany({
    where: {
      active: true,
      project: { companyId: user.companyId, status: { notIn: ['CLOSED', 'COMPLETED'] } },
    },
    include: {
      project: { select: { id: true, number: true, name: true } },
      responsible: { select: { name: true } },
      submissions: { select: { id: true, dueDate: true, periodEnd: true, submittedAt: true, reference: true } },
    },
    orderBy: { firstDueDate: 'asc' },
  })

  const asOf = today()
  const horizon = new Date(asOf.getTime() + 365 * 86_400_000)
  const now = new Date()

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ConstructX//Labor compliance//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(`${user.companyName} labor compliance`)}`,
    'X-WR-TIMEZONE:UTC',
  ]

  for (const requirement of requirements) {
    const answered = new Set(requirement.submissions.map((submission) => submission.dueDate.getTime()))

    const derived = deriveCompliance(
      {
        id: requirement.id,
        kind: requirement.kind,
        title: requirement.title,
        agency: requirement.agency,
        frequency: requirement.frequency,
        firstDueDate: requirement.firstDueDate,
        endsOn: requirement.endsOn,
        leadDays: requirement.leadDays,
        responsibleName: requirement.responsible?.name ?? null,
        active: requirement.active,
      },
      requirement.submissions.map((submission) => ({
        id: submission.id,
        dueDate: submission.dueDate,
        periodEnd: submission.periodEnd,
        submittedAt: submission.submittedAt,
        submittedByName: null,
        reference: submission.reference,
      })),
      asOf,
    )

    // Everything still outstanding, whether it is behind or ahead. A deadline
    // that has been answered is left out, so the calendar clears as work is done.
    const outstanding = deadlinesThrough(
      { frequency: requirement.frequency, firstDueDate: requirement.firstDueDate, endsOn: requirement.endsOn },
      horizon,
    ).filter((deadline) => !answered.has(deadline.getTime()))

    for (const deadline of outstanding) {
      const overdue = deadline.getTime() < asOf.getTime()
      const description = [
        `${requirement.project.number} ${requirement.project.name}`,
        requirement.agency ? `Filed with ${requirement.agency}.` : null,
        requirement.responsible?.name ? `${requirement.responsible.name} is responsible.` : 'Nobody is named as responsible.',
        overdue ? `Overdue. ${derived.summary}` : null,
        requirement.notes,
      ]
        .filter(Boolean)
        .join('\n')

      lines.push(
        'BEGIN:VEVENT',
        `UID:${requirement.id}-${dateStamp(deadline)}@constructx`,
        `DTSTAMP:${timestamp(now)}`,
        `DTSTART;VALUE=DATE:${dateStamp(deadline)}`,
        `DTEND;VALUE=DATE:${dateStamp(new Date(deadline.getTime() + 86_400_000))}`,
        fold(`SUMMARY:${escape(`${overdue ? 'Overdue: ' : ''}${requirement.title}, ${requirement.project.number}`)}`),
        fold(`DESCRIPTION:${escape(description)}`),
        'TRANSP:TRANSPARENT',
        `CATEGORIES:${escape('Labor compliance')}`,
        // On the morning it is due, and again at the requirement's lead time.
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        'TRIGGER:-PT9H',
        fold(`DESCRIPTION:${escape(`${requirement.title} is due today on ${requirement.project.number}`)}`),
        'END:VALARM',
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:-P${Math.max(1, requirement.leadDays)}D`,
        fold(
          `DESCRIPTION:${escape(`${requirement.title} is due in ${Math.max(1, requirement.leadDays)} days on ${requirement.project.number}`)}`,
        ),
        'END:VALARM',
        'END:VEVENT',
      )
    }
  }

  lines.push('END:VCALENDAR')

  return new Response(`${lines.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="constructx-compliance.ics"',
      'Cache-Control': 'no-store',
    },
  })
}
