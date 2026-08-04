import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({ variable: '--font-sans', subsets: ['latin'], display: 'swap' })
const mono = JetBrains_Mono({ variable: '--font-mono', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: {
    default: 'ConstructX',
    template: '%s · ConstructX',
  },
  description:
    'Financial operating system for general contractors — estimating, bidding, budgets, job cost, forecasting and company-wide financial control.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before paint so the app never flashes the wrong palette. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cx-theme');if(!t)t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      {/*
        Extensions such as Grammarly and password managers add their own
        attributes to <body> before React hydrates, which React then reports as
        a server/client mismatch. Suppressing it here covers the attributes on
        this element only — a genuine mismatch inside the app still surfaces.
      */}
      <body className="min-h-full" style={{ fontFamily: 'var(--font-sans)' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
