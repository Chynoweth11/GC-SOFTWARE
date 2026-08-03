import { redirect } from 'next/navigation'
import { authenticate, getSessionUser } from '@/lib/auth'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  if (await getSessionUser()) redirect('/')
  const { error } = await searchParams

  async function signIn(formData: FormData) {
    'use server'
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')
    if (!email || !password) redirect('/login?error=Enter+your+email+and+password')

    const user = await authenticate(email, password)
    if (!user) redirect('/login?error=That+email+and+password+combination+was+not+recognised')
    redirect('/')
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: 'var(--surface-sunken)' }}>
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            CX
          </div>
          <h1 className="text-lg font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
            ConstructX
          </h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            Financial operating system for general contractors
          </p>
        </div>

        <div className="card p-5">
          <LoginForm action={signIn} error={error} />
        </div>

        <div
          className="mt-4 rounded-lg border px-3 py-2.5 text-xs"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-raised)', color: 'var(--text-muted)' }}
        >
          <p className="mb-1 font-medium" style={{ color: 'var(--text)' }}>
            Demo accounts
          </p>
          <p>
            <code>owner@constructx.com</code> · full access
            <br />
            <code>o.reed@constructx.com</code> · project manager
            <br />
            <code>estimator@constructx.com</code> · estimator
            <br />
            <code>accounting@constructx.com</code> · accounting
          </p>
          <p className="mt-1.5">
            Password for every account: <code>constructx</code>
          </p>
        </div>
      </div>
    </main>
  )
}
