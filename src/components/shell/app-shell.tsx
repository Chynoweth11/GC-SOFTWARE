'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { ROLE_LABELS } from '@/lib/permissions'
import type { Role } from '@/generated/prisma/client'

interface ProjectOption {
  id: string
  number: string
  name: string
  status: string
}

interface Props {
  user: { id: string; name: string; email: string; role: Role; companyName: string }
  company: { id: string; name: string }
  projects: ProjectOption[]
  signOut: () => Promise<void>
  capabilities: { companyFinancials: boolean; estimates: boolean; pipeline: boolean; admin: boolean }
  children: ReactNode
}

const ICONS = {
  dashboard: 'M3 12h6V3H3v9Zm0 9h6v-7H3v7Zm8 0h10v-9H11v9Zm0-18v7h10V3H11Z',
  projects: 'M3 5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Z',
  estimating: 'M6 2h9l5 5v15H6V2Zm3 8h8M9 14h8M9 18h5',
  pipeline: 'M3 4h18l-7 8v7l-4 2v-9L3 4Z',
  reports: 'M4 3h16v18H4V3Zm4 12v3m4-8v8m4-11v11',
  admin: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.1l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.9-1.1L14.6 2h-4l-.4 2.8c-.7.3-1.3.6-1.9 1.1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.2l-2 1.6 2 3.4 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.8h4l.4-2.8c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.4-2-1.6c.1-.4.1-.7.1-1.1Z',
} as const

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  )
}

function ThemeToggle() {
  // The inline script in the document head has already applied the stored theme
  // by the time this hydrates, so read it during initialisation rather than
  // setting state from an effect and re-rendering.
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    typeof document === 'undefined'
      ? 'light'
      : ((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') ?? 'light'),
  )

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('cx-theme', next)
    setTheme(next)
  }

  return (
    <button onClick={toggle} className="btn btn-ghost px-2" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title="Toggle theme">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        )}
      </svg>
    </button>
  )
}

/** Project switcher: keeps the current sub-route when jumping between projects. */
function ProjectSelector({ projects }: { projects: ProjectOption[] }) {
  const pathname = usePathname()
  const router = useRouter()

  const match = pathname.match(/^\/projects\/([^/]+)(\/.*)?$/)
  const currentId = match?.[1] ?? ''
  const subPath = match?.[2] ?? ''

  return (
    <select
      value={currentId}
      onChange={(e) => {
        const id = e.target.value
        router.push(id ? `/projects/${id}${subPath}` : '/projects')
      }}
      className="field max-w-[15rem] py-1.5 text-xs"
      aria-label="Select project"
    >
      <option value="">All projects</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.number}: {p.name}
        </option>
      ))}
    </select>
  )
}

export function AppShell({ user, company, projects, signOut, capabilities, children }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const nav = [
    { href: '/', label: 'Dashboard', icon: ICONS.dashboard, show: true },
    { href: '/projects', label: 'Projects', icon: ICONS.projects, show: true },
    { href: '/estimating', label: 'Estimating', icon: ICONS.estimating, show: capabilities.estimates },
    { href: '/pipeline', label: 'Bid pipeline', icon: ICONS.pipeline, show: capabilities.pipeline },
    { href: '/reports', label: 'Reports', icon: ICONS.reports, show: true },
    { href: '/admin', label: 'Settings', icon: ICONS.admin, show: capabilities.admin },
  ].filter((n) => n.show)

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r transition-transform lg:static lg:translate-x-0 no-print ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ background: 'var(--surface-raised)', borderColor: 'var(--border)' }}
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: 'var(--accent)' }}>
            CX
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold leading-tight" style={{ color: 'var(--text)' }}>
              {company.name}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
              Financial operations
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {nav.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors"
                style={{
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                <NavIcon path={item.icon} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="border-t p-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{ background: 'var(--surface-inset)', color: 'var(--text-muted)' }}
            >
              {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium" style={{ color: 'var(--text)' }}>
                {user.name}
              </div>
              <div className="truncate text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                {ROLE_LABELS[user.role]}
              </div>
            </div>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn btn-ghost mt-1 w-full justify-start px-2.5 text-xs">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden no-print" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 no-print"
          style={{ background: 'color-mix(in oklab, var(--surface-raised) 88%, transparent)', borderColor: 'var(--border)', backdropFilter: 'blur(8px)' }}
        >
          <button className="btn btn-ghost px-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <ProjectSelector projects={projects} />

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden text-xs sm:inline" style={{ color: 'var(--text-subtle)' }}>
              Data date · Mar 31, 2026
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  )
}
