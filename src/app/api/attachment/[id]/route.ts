import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { checksumOf, getFile } from '@/lib/storage'

/**
 * Hands back an attached financial record, having checked it is the same file.
 *
 * The checksum is compared on the way out, not only on the way in. An
 * attachment is evidence behind an approval, and evidence that has quietly
 * changed since it was filed is worse than no evidence: it looks right. When
 * the bytes no longer match, the download is refused and says so, rather than
 * serving a file that is not the one that was approved.
 *
 * Everything is scoped to the company through the document that owns it, so an
 * id from another account reads as missing rather than as forbidden.
 */
/** A file name safe to put inside a quoted header value. */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["\\]/g, '')
    .trim()
  return cleaned.slice(0, 200) || 'attachment'
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return new Response('Sign in first.', { status: 401 })
  if (!can(user.role, 'view:project_financials')) return new Response('Not permitted.', { status: 403 })

  const { id } = await params
  const attachment = await prisma.documentAttachment.findFirst({
    where: { id, changeOrder: { project: { companyId: user.companyId } } },
    select: {
      fileName: true,
      contentType: true,
      storage: true,
      storageKey: true,
      checksum: true,
      location: true,
    },
  })
  if (!attachment) return new Response('No such attachment.', { status: 404 })

  if (!attachment.storage || !attachment.storageKey) {
    return new Response(
      attachment.location
        ? `This attachment is a reference to a file held elsewhere: ${attachment.location}`
        : 'This attachment is a note, with no file behind it.',
      { status: 409, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  const bytes = await getFile(attachment.storage, attachment.storageKey)
  if (!bytes) {
    return new Response('The file is recorded here but is no longer in the store.', { status: 410 })
  }

  if (attachment.checksum && checksumOf(bytes) !== attachment.checksum) {
    return new Response(
      'This file no longer matches the one that was filed. It has not been served, because a changed record is worse than a missing one. Tell an administrator.',
      { status: 409, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': attachment.contentType ?? 'application/octet-stream',
      /*
        Attachment rather than inline: these are records to keep, and a PDF
        rendered in the page is one browser setting away from being printed
        instead of filed. It also means a file that somehow got past the type
        check cannot be rendered as a page in this origin.

        The name is a field somebody typed, so anything that could end a header
        line or a quoted string comes out. A control character here would let a
        file name write its own response headers.
      */
      'Content-Disposition': `attachment; filename="${safeFileName(attachment.fileName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
