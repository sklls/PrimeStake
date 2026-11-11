'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Land on the existing callback, which exchanges the code for a session
    // and then forwards to the page where the new password is chosen.
    const redirectTo = `${window.location.origin}/auth/callback?next=/update-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })

    if (error) {
      // Supabase never reveals whether an address has an account here, so the
      // only errors worth showing are about sending, not about the account.
      const rateLimited = error.status === 429 || /rate limit/i.test(error.message)
      setError(
        rateLimited
          ? 'Too many requests just now. Please wait a minute and try again.'
          : 'We could not send the email just now. Please try again in a moment.'
      )
    } else {
      setSent(true)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-baize flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-table rounded-2xl p-8 shadow-xl border border-rail">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-amber">PrimeStake</h1>
          <p className="text-slate mt-1 italic">Luck is for the Unprepared</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white text-center">Check your email</h2>
            {/* Deliberately the same wording whether or not the address has an
                account, so this page cannot be used to find out who is signed up. */}
            <p className="text-slate text-sm text-center">
              If <span className="text-white">{email.trim()}</span> has a PrimeStake account, a
              link to set a new password is on its way.
            </p>
            <p className="text-slate-faded text-xs text-center">
              The link lasts about an hour and can only be used once. If nothing arrives, check
              your spam folder.
            </p>
            <button
              onClick={() => { setSent(false); setError('') }}
              className="w-full py-3 bg-raised hover:bg-rail text-white font-semibold rounded-lg transition-colors"
            >
              Use a different email
            </button>
            <Link
              href="/login"
              className="block text-center text-sm text-amber hover:text-amber-deep transition-colors"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-semibold text-white text-center mb-2">
              Forgot your password?
            </h2>
            <p className="text-slate text-sm text-center mb-6">
              Enter your email and we&apos;ll send you a link to set a new one.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                className="w-full px-4 py-3 bg-raised border border-rail rounded-lg text-white placeholder-slate-faded focus:outline-none focus:ring-2 focus:ring-amber"
              />

              {error && <p className="text-crimson-light text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 bg-amber hover:bg-amber-deep disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <Link
              href="/login"
              className="block text-center text-sm text-amber hover:text-amber-deep transition-colors mt-4"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
