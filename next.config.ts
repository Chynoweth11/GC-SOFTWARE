import type { NextConfig } from 'next'

/**
 * Origins allowed to invoke a Server Action.
 *
 * Next compares the request's `Origin` against the `Host` and rejects a
 * mismatch, which is the CSRF protection that stops another site posting to
 * your actions. Cloud development environments break that comparison: the
 * browser is on `https://something-3000.app.github.dev` while the server sees
 * `localhost:3000`, so every form — including sign-in — fails with "Invalid
 * Server Actions request".
 *
 * The well-known development hosts are therefore trusted in development only.
 * Production keeps the strict same-origin rule, and anything else is named
 * explicitly through ALLOWED_ORIGINS rather than being guessed.
 */
const DEV_TUNNEL_HOSTS = [
  '*.app.github.dev', // GitHub Codespaces
  '*.github.dev',
  '*.githubpreview.dev', // older Codespaces
  '*.gitpod.io',
  '*.repl.co',
  '*.replit.dev',
  '*.csb.app', // CodeSandbox
  '*.ngrok-free.app',
  '*.ngrok.io',
  '*.loca.lt',
  '*.trycloudflare.com',
  'localhost:3000',
  '127.0.0.1:3000',
]

const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = [
  ...configuredOrigins,
  ...(process.env.NODE_ENV === 'development' ? DEV_TUNNEL_HOSTS : []),
]

const nextConfig: NextConfig = {
  experimental: {
    // `forbidden()` is how a page refuses a role that lacks the capability.
    // Without this flag the call throws instead of rendering the 403 page, and
    // a user without permission gets a server error rather than an explanation.
    authInterrupts: true,
    ...(allowedOrigins.length > 0 ? { serverActions: { allowedOrigins } } : {}),
  },
}

export default nextConfig
