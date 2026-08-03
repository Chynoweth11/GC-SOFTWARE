import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cache } from 'react'
import { prisma } from './db'
import type { Role } from '@/generated/prisma/client'

const SESSION_COOKIE = 'constructx_session'
const SESSION_DAYS = 14

/** scrypt with a per-password salt; no external dependency, no fixed work factor drift. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${derived}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const derived = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  companyId: string
  companyName: string
}

/**
 * Reads the current session. Cached per request so a page rendering a dozen
 * server components performs one lookup, not a dozen.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { company: true } } },
  })

  if (!session || session.expiresAt < new Date() || !session.user.active) return null

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    companyId: session.user.companyId,
    companyName: session.user.company.name,
  }
})

/** Every protected page and server action starts here. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)

  await prisma.session.create({ data: { token, userId, expiresAt } })
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } })

  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await prisma.session.deleteMany({ where: { token } })
  store.delete(SESSION_COOKIE)
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: { company: true },
  })
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return null

  await createSession(user.id)
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    companyName: user.company.name,
  }
}
