'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '@/lib/password'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  // The recovery link gives the visitor a real session via /auth/callback.
  // Without one there is nothing to update, so say so plainly instead of
  // letting the form fail on submit.
  const [status, setStatus] = useState<'checking' | 'ready' | 'no-session'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setStatus(data.session ? 'ready' : 'no-session')
    })
    return () => { active = false }
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const check = validateNewPassword(password, confirm)
    if (!check.ok) {
      setError(check.error)
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(
        /different from the old password/i.test(error.message)
          ? 'That is already your current password. Please choose a new one.'
          : error.message
      )
      return
    }

    // The recovery session is a real session, so they are signed in already.
    router.push('/')
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen bg-baize flex items-center justify-center px-4">
        <p className="text-slate text-sm">Checking your link...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-baize flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-table rounded-2xl p-8 shadow-xl border border-rail">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-amber">PrimeStake</h1>
          <p className="text-slate mt-1 italic">Luck is for the Unprepared</p>
        </div>

        {status === 'no-session' ? (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white text-center">This link has expired</h2>
            <p className="text-slate text-sm text-center">
              Reset links last about an hour and work only once. Request a fresh one and it will
              work straight away.
            </p>
            <Link
              href="/forgot-password"
              className="block w-full py-3 bg-amber hover:bg-amber-deep text-white font-semibold rounded-lg transition-colors text-center"
            >
              Send a new link
            </Link>
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
              Choose a new password
            </h2>
            {/* The rule is stated before they type, not after they submit. */}
            <p className="text-slate text-sm text-center mb-6">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type={reveal ? 'text' : 'password'}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="w-full px-4 py-3 bg-raised border border-rail rounded-lg text-white placeholder-slate-faded focus:outline-none focus:ring-2 focus:ring-amber"
              />
              <input
                type={reveal ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full px-4 py-3 bg-raised border border-rail rounded-lg text-white placeholder-slate-faded focus:outline-none focus:ring-2 focus:ring-amber"
              />

              <label className="flex items-center gap-2 text-xs text-slate cursor-pointer">
                <input
                  type="checkbox"
                  checked={reveal}
                  onChange={(e) => setReveal(e.target.checked)}
                  className="accent-amber"
                />
                Show passwords
              </label>

              {error && <p className="text-crimson-light text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-amber hover:bg-amber-deep disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
              >
                {loading ? 'Saving...' : 'Save new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
