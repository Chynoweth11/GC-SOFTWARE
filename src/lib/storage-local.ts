import 'server-only'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * The local-disk store, kept in its own module.
 *
 * Loaded only when this is the store in use, so a deployment on object storage
 * never pulls the filesystem work in at all.
 *
 * The directory is read from the environment and required to be absolute in
 * production. A relative path would have to be resolved against the working
 * directory, and a working directory is not a thing a deployment should be
 * relying on: the same configuration then means different directories depending
 * on where the process was started, which is how a company discovers its signed
 * contracts are somewhere nobody is backing up.
 */

const DEVELOPMENT_DEFAULT = './var/uploads'

export function localRoot(): string {
  const configured = process.env.FILE_STORAGE_DIR

  if (configured) {
    if (!path.isAbsolute(configured) && process.env.NODE_ENV === 'production') {
      throw new Error(
        `FILE_STORAGE_DIR is "${configured}". Give it an absolute path, so where the files go does not depend on where the process was started.`,
      )
    }
    return path.isAbsolute(configured) ? configured : path.resolve(configured)
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'FILE_STORAGE_DIR is not set. Point it at a directory that is backed up, or set FILE_STORAGE=s3.',
    )
  }
  return path.resolve(DEVELOPMENT_DEFAULT)
}

export async function writeLocal(key: string, body: Buffer): Promise<void> {
  const destination = path.join(localRoot(), key)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, body)
}

export async function readLocal(key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(localRoot(), key))
  } catch {
    return null
  }
}

export async function removeLocal(key: string): Promise<void> {
  try {
    await unlink(path.join(localRoot(), key))
  } catch {
    // Already gone, which is the state we wanted.
  }
}
