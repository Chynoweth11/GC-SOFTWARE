import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import './globals.css'

const inter = Inter({ variable: '--font-sans', subsets: ['latin'], display: 'swap' })
const mono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'ConstructX',
    template: '%s · ConstructX',
  },
  description:
    'Financial operating system for general contractors: estimating, bidding, budgets, job cost, forecasting and company-wide financial control.',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  /*
    The chosen theme is rendered onto <html> here, on the server.

    It used to be applied by an inline script in the head. That script is
    present in the markup but React never executes it, so the palette was
    applied on the click and lost on the next page load. Reading a cookie on
    the server also means the first paint is already correct, with nothing to
    run before the page is usable.

    No cookie means the visitor has never chosen, and the stylesheet follows
    their operating system.
  */
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} h-full`}
      data-theme={theme}
      suppressHydrationWarning
    >
      {/*
        Extensions such as Grammarly and password managers add their own
        attributes to <body> before React hydrates, which React then reports as
        a server/client mismatch. Suppressing it here covers the attributes on
        this element only: a genuine mismatch inside the app still surfaces.
      */}
      <body className="min-h-full" style={{ fontFamily: 'var(--font-sans)' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
