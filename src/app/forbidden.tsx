import Link from 'next/link'

/**
 * Rendered whenever a page calls `forbidden()`.
 *
 * It names the restriction plainly rather than pretending the page does not
 * exist: in a financial system the honest answer is that the figures are real
 * and someone else is allowed to see them.
 */
export default function Forbidden() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
      <div className="card max-w-md p-6 text-center">
        <p className="label mb-2">403: not permitted</p>
        <h1 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>
          Your role cannot open this page
        </h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--text-muted)' }}>
          This part of ConstructX holds figures your role is not cleared for: company profit, margins, pay rates or the cash
          position. Ask an administrator if you need access.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to the dashboard
        </Link>
      </div>
    </main>
  )
}
