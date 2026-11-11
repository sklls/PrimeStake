import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { safeNextPath } from '@/lib/auth-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Password recovery links arrive here with ?next=/update-password.
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // An expired or already-used recovery link lands here. The sign-in page
  // explains the failure and offers a fresh link.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
