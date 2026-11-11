import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase-server'
import { generateTempPassword } from '@/lib/password'

async function verifyAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/reset-password  { user_id }
// Sets a fresh temporary password and returns it exactly once, for an admin to
// pass on when the player cannot receive the reset email. The password is never
// logged and never stored anywhere in readable form — Supabase keeps only its
// hash, and this response is the single copy.
export async function POST(request: Request) {
  const admin_user = await verifyAdmin()
  if (!admin_user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const userId = body?.user_id
  if (typeof userId !== 'string' || !userId) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  const admin = createAdminClient()
  const password = generateTempPassword()

  const { data, error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ password, email: data.user?.email ?? null })
}
