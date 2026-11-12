import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getStaff } from '@/lib/scoring/server'

// GET /api/umpire/matches — what a referee might score: live and upcoming
// matches, plus anything finished in the last two days.
export async function GET() {
  const staff = await getStaff()
  if (!staff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await admin
    .from('matches')
    .select('id, sport, format, team_a, team_b, match_date, venue, status, match_scores(scorer_name, ended_at, state)')
    .or(`status.in.(live,upcoming),and(status.eq.completed,match_date.gte.${since})`)
    .order('match_date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const matches = (data ?? []).map(m => {
    const raw = (m as { match_scores?: unknown }).match_scores
    const sc = (Array.isArray(raw) ? raw[0] : raw) as
      | { scorer_name: string | null; ended_at: string | null; state: { score?: unknown; status?: string; result?: string | null } }
      | null | undefined
    const { match_scores: _drop, ...rest } = m as Record<string, unknown>
    return {
      ...rest,
      scoring: sc ? {
        scorer_name: sc.scorer_name,
        ended: Boolean(sc.ended_at),
        score: sc.state?.score ?? null,
        status: sc.state?.status ?? null,
        result: sc.state?.result ?? null,
      } : null,
    }
  })
  return NextResponse.json({ matches, me: { id: staff.id, role: staff.role } })
}
