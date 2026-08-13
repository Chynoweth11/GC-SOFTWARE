import 'server-only'

/**
 * Sending mail, through somebody else's infrastructure.
 *
 * Deliverability is not a problem worth solving here. Getting a compliance
 * reminder into an inbox rather than a spam folder means SPF, DKIM, DMARC,
 * warmed sending addresses, bounce handling and a reputation to protect, and a
 * general contractor's financial system has no business owning any of that. So
 * this is a thin front on a provider that already does it.
 *
 * Two providers are supported and both are configured entirely by environment,
 * so moving from one to the other is a variable change and no code change:
 *
 *   MAIL_PROVIDER   resend | smtp | none      (default: none)
 *   MAIL_FROM       "ConstructX <alerts@yourdomain.com>"
 *   MAIL_REPLY_TO   optional
 *
 *   Resend:  RESEND_API_KEY
 *   SMTP:    SMTP_URL, for example smtps://user:pass@smtp.host.com:465
 *
 * With nothing configured the transport reports itself unconfigured and every
 * send is refused with a reason. That is deliberate: an alerting feature that
 * silently sends nothing is worse than one that says it is switched off, and
 * the settings page shows which it is.
 */

export type MailProvider = 'resend' | 'smtp' | 'none'

export interface MailMessage {
  to: string[]
  subject: string
  /** The plain text body. Always sent, because some people still read it. */
  text: string
  /** The HTML body. Optional; the text is used alone when it is absent. */
  html?: string
  replyTo?: string
}

export interface MailResult {
  sent: boolean
  /** The provider's own id for the message, where it gives one. */
  id?: string
  error?: string
}

export interface MailConfig {
  provider: MailProvider
  from: string
  replyTo: string | null
  /** Whether everything this provider needs is actually present. */
  configured: boolean
  /** What is missing, in words, when it is not. */
  missing: string[]
}

/** Reads the environment once, and says plainly what is and is not set. */
export function mailConfig(env: NodeJS.ProcessEnv = process.env): MailConfig {
  const provider = (env.MAIL_PROVIDER ?? 'none').toLowerCase() as MailProvider
  const from = env.MAIL_FROM ?? ''
  const replyTo = env.MAIL_REPLY_TO ?? null
  const missing: string[] = []

  if (provider === 'none') {
    return { provider: 'none', from, replyTo, configured: false, missing: ['MAIL_PROVIDER'] }
  }
  if (!from) missing.push('MAIL_FROM')
  if (provider === 'resend' && !env.RESEND_API_KEY) missing.push('RESEND_API_KEY')
  if (provider === 'smtp' && !env.SMTP_URL) missing.push('SMTP_URL')

  return { provider, from, replyTo, configured: missing.length === 0, missing }
}

/**
 * Resend, over its HTTP API.
 *
 * HTTP rather than a client library on purpose: one fetch, no dependency, and
 * nothing to keep up to date. The API is stable and this is the whole of it.
 */
async function sendThroughResend(message: MailMessage, config: MailConfig): Promise<MailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ?? config.replyTo ? { reply_to: message.replyTo ?? config.replyTo } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    return { sent: false, error: `Resend refused the message: ${response.status} ${detail.slice(0, 300)}` }
  }
  const body = (await response.json()) as { id?: string }
  return { sent: true, id: body.id }
}

/**
 * Any SMTP server, through nodemailer.
 *
 * Loaded only when it is the chosen provider, so a deployment on Resend never
 * pays for the dependency and one without mail at all never touches it.
 */
async function sendThroughSmtp(message: MailMessage, config: MailConfig): Promise<MailResult> {
  /*
    Imported by name built at runtime so the bundler leaves it alone, and typed
    loosely because it is an optional dependency: a deployment on Resend, or on
    no mail at all, must not be required to install it.
  */
  const moduleName = 'nodemailer'
  const loaded = (await import(/* webpackIgnore: true */ moduleName).catch(() => null)) as {
    createTransport: (url: string) => {
      sendMail: (message: Record<string, unknown>) => Promise<{ messageId: string }>
    }
  } | null

  if (!loaded) {
    return {
      sent: false,
      error: 'MAIL_PROVIDER is smtp but nodemailer is not installed. Run npm install nodemailer.',
    }
  }

  const transport = loaded.createTransport(process.env.SMTP_URL!)
  const info = await transport.sendMail({
    from: config.from,
    to: message.to.join(', '),
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo ?? config.replyTo ?? undefined,
  })
  return { sent: true, id: info.messageId }
}

/**
 * Sends one message, or says why it did not.
 *
 * Never throws. A reminder that cannot be sent must not take down the page or
 * the scheduled run that asked for it, and the reason belongs in the result
 * where the caller can record it.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const config = mailConfig()

  if (!config.configured) {
    return {
      sent: false,
      error:
        config.provider === 'none'
          ? 'No mail provider is configured, so nothing was sent. Set MAIL_PROVIDER to resend or smtp.'
          : `Mail is set to ${config.provider} but ${config.missing.join(' and ')} ${config.missing.length === 1 ? 'is' : 'are'} not set.`,
    }
  }
  if (message.to.length === 0) return { sent: false, error: 'Nobody to send it to.' }

  try {
    return config.provider === 'resend'
      ? await sendThroughResend(message, config)
      : await sendThroughSmtp(message, config)
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) }
  }
}
