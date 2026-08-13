import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Signing in through an identity provider the company already runs.
 *
 * A construction company does not want another password. It has Google
 * Workspace or Microsoft 365, and it already has a way to switch off a leaver's
 * account on their last day. Letting that system decide who gets in means the
 * offboarding is done once, in the place people already remember to do it, and
 * this system never holds a password it could lose.
 *
 * Three providers, all configured by environment, all following the same
 * authorization code flow. Nothing is hard coded to one of them:
 *
 *   SSO_PROVIDER        github | google | microsoft | none   (default: none)
 *   SSO_CLIENT_ID
 *   SSO_CLIENT_SECRET
 *   SSO_ALLOWED_DOMAINS optional, comma separated, for example yourgc.com
 *   SSO_TENANT          Microsoft only; defaults to "common"
 *   APP_URL             where the provider sends people back to
 *
 * Two rules that are not negotiable:
 *
 * A sign-in never creates an account. The provider proves who somebody is, not
 * what they may see, and role is the whole of the access control in this
 * system. An unknown email is turned away and told to ask an administrator,
 * because an auto-created account has to be given some role, and any role that
 * could be given by default is a role somebody did not decide to grant.
 *
 * The email must be verified by the provider. An unverified address is a claim,
 * not a fact, and on some providers it is a claim anybody can make.
 */

export type SsoProvider = 'github' | 'google' | 'microsoft' | 'none'

export interface SsoConfig {
  provider: SsoProvider
  clientId: string
  /** Domains a signing-in address must end with. Empty means any. */
  allowedDomains: string[]
  configured: boolean
  missing: string[]
  /** What to put on the button. */
  label: string
}

const LABELS: Record<Exclude<SsoProvider, 'none'>, string> = {
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
}

export function ssoConfig(env: NodeJS.ProcessEnv = process.env): SsoConfig {
  const provider = (env.SSO_PROVIDER ?? 'none').toLowerCase() as SsoProvider
  const clientId = env.SSO_CLIENT_ID ?? ''
  const allowedDomains = (env.SSO_ALLOWED_DOMAINS ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)

  if (provider === 'none' || !LABELS[provider as Exclude<SsoProvider, 'none'>]) {
    return { provider: 'none', clientId, allowedDomains, configured: false, missing: ['SSO_PROVIDER'], label: '' }
  }

  const missing: string[] = []
  if (!clientId) missing.push('SSO_CLIENT_ID')
  if (!env.SSO_CLIENT_SECRET) missing.push('SSO_CLIENT_SECRET')
  if (!env.APP_URL) missing.push('APP_URL')

  return {
    provider,
    clientId,
    allowedDomains,
    configured: missing.length === 0,
    missing,
    label: LABELS[provider as Exclude<SsoProvider, 'none'>],
  }
}

export function redirectUri(): string {
  return `${(process.env.APP_URL ?? '').replace(/\/$/, '')}/api/auth/sso/callback`
}

/**
 * The state parameter, signed rather than stored.
 *
 * It has to survive a round trip through the provider and come back proving it
 * started here, which is what stops somebody feeding a victim a login link that
 * signs them into the attacker's account. Signing it with the client secret
 * means no server-side session store is needed for the sixty seconds it lives.
 */
export function signState(nonce: string, issuedAt: number): string {
  const payload = `${nonce}.${issuedAt}`
  const signature = createHmac('sha256', process.env.SSO_CLIENT_SECRET ?? '').update(payload).digest('hex')
  return `${payload}.${signature}`
}

export function newState(): string {
  return signState(randomBytes(16).toString('hex'), Date.now())
}

/** Valid, correctly signed, and no more than ten minutes old. */
export function stateIsValid(state: string): boolean {
  const parts = state.split('.')
  if (parts.length !== 3) return false
  const [nonce, issuedAt, signature] = parts

  const expected = createHmac('sha256', process.env.SSO_CLIENT_SECRET ?? '')
    .update(`${nonce}.${issuedAt}`)
    .digest('hex')
  const given = Buffer.from(signature, 'hex')
  const want = Buffer.from(expected, 'hex')
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false

  const age = Date.now() - Number(issuedAt)
  return Number.isFinite(age) && age >= 0 && age < 10 * 60_000
}

/** Where to send somebody to prove who they are. */
export function authorizeUrl(state: string): string {
  const config = ssoConfig()
  const redirect = redirectUri()

  if (config.provider === 'github') {
    const query = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirect,
      // The address is what identifies somebody here, and GitHub does not
      // include it in the profile unless it is asked for separately.
      scope: 'read:user user:email',
      state,
    })
    return `https://github.com/login/oauth/authorize?${query}`
  }

  if (config.provider === 'google') {
    const query = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      // Always ask which account, rather than silently using whichever one the
      // browser happens to be signed into.
      prompt: 'select_account',
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${query}`
  }

  const tenant = process.env.SSO_TENANT ?? 'common'
  const query = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${query}`
}

export interface SsoIdentity {
  email: string
  name: string | null
}

/** Reads the email out of an OpenID Connect id token, without trusting a library. */
function emailFromIdToken(idToken: string): SsoIdentity | null {
  const payload = idToken.split('.')[1]
  if (!payload) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: string
      email_verified?: boolean | string
      preferred_username?: string
      name?: string
    }
    const email = claims.email ?? claims.preferred_username
    if (!email) return null
    // Google states this explicitly. Microsoft does not always, and an address
    // from a tenant-issued token is verified by definition.
    if (claims.email_verified === false || claims.email_verified === 'false') return null
    return { email: email.toLowerCase(), name: claims.name ?? null }
  } catch {
    return null
  }
}

/**
 * Swaps the code the provider sent back for the person's verified address.
 *
 * Returns null rather than throwing on anything unexpected, because everything
 * on this path is attacker-reachable and the caller's job is to turn any
 * failure into the same unhelpful message.
 */
export async function identityFromCode(code: string): Promise<SsoIdentity | null> {
  const config = ssoConfig()
  if (!config.configured) return null
  const redirect = redirectUri()

  if (config.provider === 'github') {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: process.env.SSO_CLIENT_SECRET,
        code,
        redirect_uri: redirect,
      }),
    })
    if (!tokenResponse.ok) return null
    const token = (await tokenResponse.json()) as { access_token?: string }
    if (!token.access_token) return null

    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ConstructX',
    }
    const [profileResponse, emailResponse] = await Promise.all([
      fetch('https://api.github.com/user', { headers }),
      fetch('https://api.github.com/user/emails', { headers }),
    ])
    if (!emailResponse.ok) return null

    const emails = (await emailResponse.json()) as { email: string; primary: boolean; verified: boolean }[]
    // Primary and verified, in that order of preference. An unverified address
    // on GitHub is one anybody could have typed in.
    const chosen = emails.find((entry) => entry.primary && entry.verified) ?? emails.find((entry) => entry.verified)
    if (!chosen) return null

    const profile = profileResponse.ok ? ((await profileResponse.json()) as { name?: string }) : {}
    return { email: chosen.email.toLowerCase(), name: profile.name ?? null }
  }

  const tokenUrl =
    config.provider === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : `https://login.microsoftonline.com/${process.env.SSO_TENANT ?? 'common'}/oauth2/v2.0/token`

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: process.env.SSO_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
    }),
  })
  if (!tokenResponse.ok) return null

  const token = (await tokenResponse.json()) as { id_token?: string }
  if (!token.id_token) return null
  return emailFromIdToken(token.id_token)
}

/** Whether an address is one this company allows in at all. */
export function domainAllowed(email: string, config: SsoConfig = ssoConfig()): boolean {
  if (config.allowedDomains.length === 0) return true
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return config.allowedDomains.includes(domain)
}
