// ── Server-only helpers for live scoring ───────────────────
// Imports next/headers via supabase-server, so only for route handlers and
// server components.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import type { ScoreEvent, Side, Teams } from './types'

export type StaffRole = 'umpire' | 'admin'
export interface Staff { id: string; role: StaffRole; name: string }

/** The signed-in referee or admin, or null for anyone else. */
export async function getStaff(): Promise<Staff | null> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, display_name').eq('id', user.id).single()
  if (profile?.role !== 'umpire' && profile?.role !== 'admin') return null
  return { id: user.id, role: profile.role, name: profile.display_name || user.email || 'Referee' }
}

export interface MatchRow {
  id: string
  sport: string
  format: string
  team_a: string
  team_b: string
  match_date: string
  venue: string | null
  status: string
}

export interface SquadPlayer { id: string; name: string; role: string | null }
export type Squads = Record<Side, SquadPlayer[]>

/**
 * Both squads for a match. Teams are matched by name within the sport, in the
 * 'mens' category — the same lookup the fantasy squad and market player picker
 * use. Singles and doubles fixtures name players rather than teams, so they
 * usually come back empty, and their entries simply carry no player.
 */
export async function loadSquads(admin: SupabaseClient, match: MatchRow): Promise<Squads> {
  const { data } = await admin
    .from('teams')
    .select('name, team_players(id, name, role)')
    .in('name', [match.team_a, match.team_b])
    .eq('sport', match.sport)
    .eq('category', 'mens')

  const squads: Squads = { a: [], b: [] }
  for (const t of data ?? []) {
    const side: Side | null = t.name === match.team_a ? 'a' : t.name === match.team_b ? 'b' : null
    if (!side) continue
    squads[side] = ((t.team_players ?? []) as SquadPlayer[])
      .map(p => ({ id: p.id, name: p.name, role: p.role ?? null }))
      .sort((x, y) => x.name.localeCompare(y.name))
  }
  return squads
}

export const MATCH_COLUMNS = 'id, sport, format, team_a, team_b, match_date, venue, status'
export const SCORE_COLUMNS =
  'match_id, sport, settings, state, version, scorer_id, scorer_name, started_at, ended_at, updated_at'
export const EVENT_COLUMNS =
  'seq, type, side, player_id, player_name, player2_id, player2_name, data, created_at, voided_at, edited_at'

export interface ScoreRow {
  match_id: string
  sport: string
  settings: Record<string, unknown>
  state: Record<string, unknown>
  version: number
  scorer_id: string | null
  scorer_name: string | null
  started_at: string | null
  ended_at: string | null
  updated_at: string
}

export interface EventRow extends ScoreEvent {
  voided_at: string | null
  edited_at: string | null
}

export async function loadScore(admin: SupabaseClient, matchId: string): Promise<ScoreRow | null> {
  const { data } = await admin.from('match_scores').select(SCORE_COLUMNS).eq('match_id', matchId).maybeSingle()
  return (data as ScoreRow | null) ?? null
}

export async function loadEvents(admin: SupabaseClient, matchId: string): Promise<EventRow[]> {
  const { data } = await admin
    .from('match_events').select(EVENT_COLUMNS).eq('match_id', matchId).order('seq', { ascending: true })
  return (data as EventRow[] | null) ?? []
}

/** The record the score is computed from: everything not undone. */
export const liveEvents = (rows: EventRow[]): ScoreEvent[] => rows.filter(r => !r.voided_at)

export const teamsOf = (m: MatchRow): Teams => ({ a: m.team_a, b: m.team_b })
