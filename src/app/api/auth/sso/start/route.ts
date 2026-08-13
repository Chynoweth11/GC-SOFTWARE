import { redirect } from 'next/navigation'
import { authorizeUrl, newState, ssoConfig } from '@/lib/sso'

/** Sends somebody to their identity provider, carrying a signed state. */
export async function GET() {
  const config = ssoConfig()
  if (!config.configured) {
    redirect(`/login?error=${encodeURIComponent('Single sign-on is not configured on this deployment.')}`)
  }
  redirect(authorizeUrl(newState()))
}
