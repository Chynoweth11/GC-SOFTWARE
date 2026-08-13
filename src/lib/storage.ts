import 'server-only'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Where an attached financial document actually lives.
 *
 * Before this, an attachment was a file name and a path somebody typed. The
 * approval flow tells you to attach the signed copy and the audit trail records
 * that you did, but if that file was moved or renamed the record pointed at
 * nothing. For a document whose whole purpose is proving that a million dollars
 * was signed for, that was the weak link.
 *
 * Two stores, chosen by environment:
 *
 *   FILE_STORAGE=local              a directory on the server (default)
 *   FILE_STORAGE_DIR=./var/uploads
 *
 *   FILE_STORAGE=s3                 any S3-compatible service: AWS, Cloudflare
 *   S3_BUCKET=                      R2, Backblaze B2, MinIO, DigitalOcean
 *   S3_REGION=auto                  Spaces
 *   S3_ENDPOINT=                    omit for AWS itself
 *   S3_ACCESS_KEY_ID=
 *   S3_SECRET_ACCESS_KEY=
 *
 * S3 is signed here rather than through the AWS SDK. Two requests are needed,
 * PUT and GET, both plain HTTP with a SigV4 header, and the whole of that is
 * eighty lines. The SDK is several megabytes and a standing upgrade obligation
 * for the same two requests.
 *
 * Keys are random, not derived from the file name. A signed change order must
 * not be findable by guessing at likely names, and two people attaching
 * "signed.pdf" must not collide.
 */

export type StorageKind = 'local' | 's3'

export interface StorageConfig {
  kind: StorageKind
  configured: boolean
  missing: string[]
  /** Where files are going, said plainly enough to put on a settings page. */
  description: string
}

/** The largest file this will accept. A signed PDF is well under this. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/**
 * What may be attached.
 *
 * A deliberately short list. These are financial records, not a file share, and
 * every type here is one a scanner or an e-signature service produces.
 */
export const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/tiff': 'tif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/csv': 'csv',
}

export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const kind = (env.FILE_STORAGE ?? 'local').toLowerCase() as StorageKind

  if (kind === 's3') {
    const missing = (
      [
        ['S3_BUCKET', env.S3_BUCKET],
        ['S3_ACCESS_KEY_ID', env.S3_ACCESS_KEY_ID],
        ['S3_SECRET_ACCESS_KEY', env.S3_SECRET_ACCESS_KEY],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name)

    return {
      kind: 's3',
      configured: missing.length === 0,
      missing,
      description: missing.length === 0 ? `S3 bucket ${env.S3_BUCKET}` : 'S3, not finished being set up',
    }
  }

  return {
    kind: 'local',
    configured: true,
    missing: [],
    description: `A directory on this server, ${env.FILE_STORAGE_DIR ?? './var/uploads'}`,
  }
}

function localRoot(): string {
  return path.resolve(process.cwd(), process.env.FILE_STORAGE_DIR ?? './var/uploads')
}

/**
 * A key nobody can guess, grouped by the document it belongs to so the store
 * can be read by a person if it ever has to be.
 */
export function newKey(documentId: string, fileName: string): string {
  const extension = path.extname(fileName).toLowerCase().slice(0, 8).replace(/[^a-z0-9.]/g, '')
  return `documents/${documentId}/${randomBytes(16).toString('hex')}${extension}`
}

// ── S3, signed by hand ─────────────────────────────────────────────────────

function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest()
}

function s3Url(key: string): { url: URL; host: string } {
  const bucket = process.env.S3_BUCKET!
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION ?? 'auto'
  const base = endpoint
    ? `${endpoint.replace(/\/$/, '')}/${bucket}`
    : `https://${bucket}.s3.${region}.amazonaws.com`
  const url = new URL(`${base}/${key.split('/').map(encodeURIComponent).join('/')}`)
  return { url, host: url.host }
}

/**
 * Signature Version 4, the payload-signed variant.
 *
 * The body hash goes into the signature rather than UNSIGNED-PAYLOAD, so a
 * proxy cannot alter the bytes between here and the bucket without the request
 * being rejected.
 */
function signedHeaders(
  method: 'PUT' | 'GET' | 'DELETE',
  key: string,
  body: Buffer,
  contentType?: string,
): { url: string; headers: Record<string, string> } {
  const { url, host } = s3Url(key)
  const region = process.env.S3_REGION ?? 'auto'
  const now = new Date()
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const day = stamp.slice(0, 8)
  const payloadHash = hash(body)

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': stamp,
  }
  if (contentType) headers['content-type'] = contentType

  const signedList = Object.keys(headers).sort().join(';')
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join('')

  const canonical = [method, url.pathname, '', canonicalHeaders, signedList, payloadHash].join('\n')
  const scope = `${day}/${region}/s3/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, hash(canonical)].join('\n')

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${process.env.S3_SECRET_ACCESS_KEY}`, day), region), 's3'),
    'aws4_request',
  )
  const signature = createHmac('sha256', signingKey).update(toSign).digest('hex')

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${process.env.S3_ACCESS_KEY_ID}/${scope}, ` +
    `SignedHeaders=${signedList}, Signature=${signature}`

  return { url: url.toString(), headers }
}

// ── The two operations the rest of the system needs ────────────────────────

export interface StoredFile {
  storage: StorageKind
  storageKey: string
  byteSize: number
  /** SHA-256 of the bytes, so the file can be proved unchanged later. */
  checksum: string
}

/** Writes the bytes and says where they went. Throws only on a real failure. */
export async function putFile(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
  const config = storageConfig()
  const checksum = createHash('sha256').update(body).digest('hex')

  if (config.kind === 's3') {
    if (!config.configured) throw new Error(`S3 is chosen but ${config.missing.join(' and ')} not set.`)
    const { url, headers } = signedHeaders('PUT', key, body, contentType)
    const response = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(body) })
    if (!response.ok) {
      throw new Error(`The bucket refused the upload: ${response.status} ${(await response.text()).slice(0, 200)}`)
    }
    return { storage: 's3', storageKey: key, byteSize: body.byteLength, checksum }
  }

  const destination = path.join(localRoot(), key)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, body)
  return { storage: 'local', storageKey: key, byteSize: body.byteLength, checksum }
}

/** Reads the bytes back. Null when the file is gone, which the caller reports. */
export async function getFile(storage: string, key: string): Promise<Buffer | null> {
  if (storage === 's3') {
    const { url, headers } = signedHeaders('GET', key, Buffer.alloc(0))
    const response = await fetch(url, { headers })
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  }

  try {
    return await readFile(path.join(localRoot(), key))
  } catch {
    return null
  }
}

/**
 * Removes the bytes. Never throws: an attachment record being deleted must not
 * be blocked by a file that has already gone from the store.
 */
export async function deleteFile(storage: string, key: string): Promise<void> {
  try {
    if (storage === 's3') {
      const { url, headers } = signedHeaders('DELETE', key, Buffer.alloc(0))
      await fetch(url, { method: 'DELETE', headers })
      return
    }
    await unlink(path.join(localRoot(), key))
  } catch {
    // Already gone, which is the state we wanted.
  }
}

/** Whether the bytes are still the ones that were approved. */
export function checksumOf(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex')
}
