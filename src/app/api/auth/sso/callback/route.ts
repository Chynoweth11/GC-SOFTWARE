import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { createSession } from '@/lib/auth'
import { domainAllowed, identityFromCode, ssoConfig, stateIsValid } from '@/lib/sso'

/**
 * Where the identity provider sends somebody back to.
 *
 * The provider has proved who they are. This decides whether that person has an
 * account here, and it never creates one: role is the whole of the access
 * control in this system, and an account created automatically would have to be
 * given a role nobody chose to grant.
 *
 * Every attempt lands in `LoginAttempt` alongside the password ones, so the
 * history of who tried to get in is in one place whichever door they used.
 */

function fail(reason: string): never {
  redirect(`/login?error=${encodeURIComponent(reason)}`)
}

export async function GET(request: NextRequest) {
  const config = ssoConfig()
  if (!config.configured) fail('Single sign-on is not configured on this deployment.')

  const params = request.nextUrl.searchParams
  if (params.get('error')) fail('Sign-in was cancelled.')

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state || !stateIsValid(state)) {
    fail('That sign-in link has expired or did not start here. Try again.')
  }

  const identity = await identityFromCode(code)
  if (!identity) {
    await prisma.loginAttempt.create({
      data: { email: 'unknown', successful: false, refusedFor: `${config.label} did not confirm an address` },
    })
    fail(`${config.label} did not give us a verified email address for that account.`)
  }

  const email = identity.email

  if (!domainAllowed(email, config)) {
    await prisma.loginAttempt.create({
      data: { email, successful: false, refusedFor: 'Domain not allowed' },
    })
    fail('That address is not on a domain this company allows.')
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user || !user.active) {
    await prisma.loginAttempt.create({
      data: { email, successful: false, refusedFor: user ? 'Account is closed' : 'No such account' },
    })
    fail(
      `${email} is signed in with ${config.label}, but has no account here. An administrator has to add it and choose what it may see.`,
    )
  }

  // The provider is the authority on somebody's name, so keep ours current.
  if (identity.name && identity.name !== user.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: identity.name } })
  }

  await prisma.loginAttempt.create({ data: { email, successful: true } })
  await createSession(user.id)
  redirect('/')
}
