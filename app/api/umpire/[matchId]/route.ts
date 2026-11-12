import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase-server'
import type { SportType } from '@/lib/sports'
import { CLOCKED, TIMED, checkEntry, computeBoard, normaliseSettings } from '@/lib/scoring'
import { clockSeconds } from '@/lib/scoring/football'
import type { ScoreEvent, Side } from '@/lib/scoring/types'
import {
  getStaff, loadEvents, loadScore, loadSquads, liveEvents, teamsOf,
  MATCH_COLUMNS, type EventRow, type MatchRow, type ScoreRow, type Squads, type Staff,
} from '@/lib/scoring/server'

// GET  /api/umpire/<matchId>  — everything the scoring console needs.
// POST /api/umpire/<matchId>  — one action: start, settings, takeover, event,
//                              void, edit, end, reopen.
//
// Moves no credits, ever. Ending a match closes its open markets to new bets
// and nothing more; settling stays the admin's own action.

const Id = z.string().uuid()
const PlayerId = z.string().uuid().nullable().optional()
const Settings = z.record(z.string(), z.unknown())

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), settings: Settings.default({}) }),
  z.object({ action: z.literal('settings'), version: z.number().int(), settings: Settings }),
  z.object({ action: z.literal('takeover'), version: z.number().int() }),
  z.object({
    action: z.literal('event'),
    version: z.number().int(),
    event: z.object({
      type: z.string().min(1).max(40),
      side: z.enum(['a', 'b']).nullable().optional(),
      player_id: PlayerId,
      player2_id: PlayerId,
      data: Settings.default({}),
    }),
  }),
  z.object({ action: z.literal('void'), version: z.number().int(), seq: z.number().int() }),
  z.object({
    action: z.literal('edit'), version: z.number().int(), seq: z.number().int(),
    player_id: PlayerId, player2_id: PlayerId,
  }),
  z.object({ action: z.literal('end'), version: z.number().int() }),
  z.object({ action: z.literal('reopen'), version: z.number().int() }),
])

type Ctx = { params: { matchId: string } }

async function loadMatch(admin: SupabaseClient, matchId: string): Promise<MatchRow | null> {
  const { data } = await admin.from('matches').select(MATCH_COLUMNS).eq('id', matchId).maybeSingle()
  return (data as MatchRow | null) ?? null
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

export async function GET(_req: Request, { params }: Ctx) {
  const staff = await getStaff()
  if (!staff) return json({ error: 'Forbidden' }, 403)
  if (!Id.safeParse(params.matchId).success) return json({ error: 'Bad match id' }, 400)

  const admin = createAdminClient()
  const match = await loadMatch(admin, params.matchId)
  if (!match) return json({ error: 'Match not found' }, 404)

  const [score, events, squads] = await Promise.all([
    loadScore(admin, match.id),
    loadEvents(admin, match.id),
    loadSquads(admin, match),
  ])
  return json({ match, score, events, squads, me: { id: staff.id, role: staff.role } })
}

export async function POST(request: Request, { params }: Ctx) {
  if (!Id.safeParse(params.matchId).success) return json({ error: 'Bad match id' }, 400)
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json({ error: 'Invalid request' }, 400)
  const body = parsed.data

  // Every referee tap waits on these, and each is a trip to the database, so
  // they go out together rather than one after another. Nothing read here is
  // returned to a caller who turns out not to be staff.
  const admin = createAdminClient()
  const [staff, match, loadedScore, loadedEvents] = await Promise.all([
    getStaff(),
    loadMatch(admin, params.matchId),
    loadScore(admin, params.matchId),
    loadEvents(admin, params.matchId),
  ])
  if (!staff) return json({ error: 'Forbidden' }, 403)
  if (!match) return json({ error: 'Match not found' }, 404)
  const sport = match.sport as SportType

  let score = loadedScore
  let events = loadedEvents
  const fresh = () => ({ score, events })

  // Squads are only needed when an entry names a player; most taps do not.
  let squadsCache: Squads | null = null
  const squadsFor = async (needed: boolean): Promise<Squads> =>
    needed ? (squadsCache ??= await loadSquads(admin, match)) : { a: [], b: [] }

  // ── start ──
  if (body.action === 'start') {
    if (score) return json({ error: 'This match has already been started', ...fresh() }, 409)
    if (match.status === 'completed' || match.status === 'cancelled') {
      return json({ error: `This match is ${match.status}` }, 400)
    }
    const settings = normaliseSettings(sport, body.settings) as Record<string, unknown>
    const state = computeBoard(sport, settings, [], teamsOf(match))
    const now = new Date().toISOString()
    const { data, error } = await admin.from('match_scores').insert({
      match_id: match.id, sport, settings, state, version: 1,
      scorer_id: staff.id, scorer_name: staff.name, started_at: now, updated_at: now,
    }).select('*').single()
    if (error) return json({ error: error.message }, 500)

    await admin.from('matches').update({ status: 'live', updated_at: now }).eq('id', match.id)
    // The score is public from here on, so fantasy line-ups must stop changing.
    await admin.from('contests').update({ status: 'locked' }).eq('match_id', match.id).eq('status', 'open')

    score = data as ScoreRow
    return json(fresh())
  }

  if (!score) return json({ error: 'Start the match first' }, 400)
  if (body.version !== score.version) {
    return json({ error: 'Someone else has changed this match. It has been reloaded.', ...fresh() }, 409)
  }

  const ended = Boolean(score.ended_at)
  const isScorer = score.scorer_id === staff.id
  const isAdmin = staff.role === 'admin'

  // ── takeover ──
  if (body.action === 'takeover') {
    if (ended) return json({ error: 'The match has ended' }, 400)
    const saved = await save(admin, score, { scorer_id: staff.id, scorer_name: staff.name })
    if (!saved) return json({ error: 'Someone else has changed this match. It has been reloaded.', ...(await reload(admin, match.id)) }, 409)
    score = saved
    return json(fresh())
  }

  // ── reopen ── (admin only, after the final whistle)
  if (body.action === 'reopen') {
    if (!isAdmin) return json({ error: 'Only an admin can reopen a match' }, 403)
    if (!ended) return json({ error: 'The match has not ended' }, 400)
    const now = new Date().toISOString()
    await admin.from('match_events')
      .update({ voided_at: now, voided_by: staff.id })
      .eq('match_id', match.id).eq('type', 'end_match').is('voided_at', null)
    events = await loadEvents(admin, match.id)
    const state = computeBoard(sport, score.settings, liveEvents(events), teamsOf(match))
    const saved = await save(admin, score, { state, ended_at: null, scorer_id: staff.id, scorer_name: staff.name })
    if (!saved) return json({ error: 'Someone else has changed this match. It has been reloaded.', ...(await reload(admin, match.id)) }, 409)
    await admin.from('matches').update({ status: 'live', updated_at: now }).eq('id', match.id)
    score = saved
    return json(fresh())
  }

  // While a match runs only its scorer writes; afterwards only an admin may
  // correct the record, and only by removing or relabelling entries.
  if (ended) {
    if (!isAdmin) return json({ error: 'The match has ended. Ask an admin to correct it.' }, 403)
    if (body.action !== 'void' && body.action !== 'edit') {
      return json({ error: 'The match has ended. Reopen it to add entries.' }, 400)
    }
  } else if (!isScorer) {
    return json({ error: `${score.scorer_name ?? 'Someone else'} is scoring this match. Take over to score.`, ...fresh() }, 409)
  }

  const teams = teamsOf(match)

  // ── settings ──
  if (body.action === 'settings') {
    const settings = normaliseSettings(sport, body.settings) as Record<string, unknown>
    const state = computeBoard(sport, settings, liveEvents(events), teams)
    const saved = await save(admin, score, { settings, state })
    if (!saved) return json({ error: 'Someone else has changed this match. It has been reloaded.', ...(await reload(admin, match.id)) }, 409)
    score = saved
    return json(fresh())
  }

  // ── void / edit ── corrections keep the entry's place in the record.
  if (body.action === 'void' || body.action === 'edit') {
    const row = events.find(e => e.seq === body.seq)
    if (!row || row.voided_at) return json({ error: 'That entry no longer exists' }, 404)
    if (row.type === 'end_match') return json({ error: 'Reopen the match instead' }, 400)

    const now = new Date().toISOString()
    let patch: Record<string, unknown>
    if (body.action === 'void') {
      patch = { voided_at: now, voided_by: staff.id }
    } else {
      const squads = await squadsFor(Boolean(body.player_id || body.player2_id))
      const p1 = resolvePlayer(squads, body.player_id ?? null)
      const p2 = resolvePlayer(squads, body.player2_id ?? null)
      if (p1 === false || p2 === false) return json({ error: 'That player is not in either squad' }, 400)
      patch = {
        player_id: p1?.id ?? null, player_name: p1?.name ?? null,
        player2_id: p2?.id ?? null, player2_name: p2?.name ?? null,
        edited_at: now, edited_by: staff.id,
      }
    }
    const { error } = await admin.from('match_events').update(patch).eq('match_id', match.id).eq('seq', row.seq)
    if (error) return json({ error: error.message }, 500)

    events = await loadEvents(admin, match.id)
    const state = computeBoard(sport, score.settings, liveEvents(events), teams)
    const saved = await save(admin, score, { state })
    if (!saved) return json({ error: 'Someone else has changed this match. It has been reloaded.', ...(await reload(admin, match.id)) }, 409)
    score = saved
    return json(fresh())
  }

  // ── event / end ── add one entry to the record.
  const board = computeBoard(sport, score.settings, liveEvents(events), teams)
  const now = Date.now()
  let draft: ScoreEvent
  if (body.action === 'end') {
    draft = blank('end_match', null, now)
  } else {
    const ev = body.event
    if (ev.type === 'end_match') return json({ error: 'Use End match' }, 400)
    const squads = await squadsFor(Boolean(ev.player_id || ev.player2_id))
    const p1 = resolvePlayer(squads, ev.player_id ?? null)
    const p2 = resolvePlayer(squads, ev.player2_id ?? null)
    if (p1 === false || p2 === false) return json({ error: 'That player is not in either squad' }, 400)
    // The server owns time: a phone's clock cannot be trusted to agree.
    const data: Record<string, unknown> = { ...ev.data }
    const offered = Number(data.clock_s)
    delete data.at
    delete data.clock_s
    if (TIMED.has(ev.type)) data.at = new Date(now).toISOString()
    if (sport === 'football' && CLOCKED.has(ev.type)) {
      // The phone reads the match minute at the referee's first tap, before
      // they pick the scorer. Accept that reading if it is at most three
      // minutes behind the server's clock and never ahead of it.
      const serverClock = clockSeconds(board.clock, now)
      data.clock_s = Number.isFinite(offered) && offered <= serverClock && offered >= serverClock - 180
        ? Math.floor(offered)
        : serverClock
    }
    draft = {
      ...blank(ev.type, (ev.side ?? null) as Side | null, now),
      player_id: p1?.id ?? null, player_name: p1?.name ?? null,
      player2_id: p2?.id ?? null, player2_name: p2?.name ?? null,
      data,
    }
  }

  const refusal = checkEntry(sport, score.settings, board, draft)
  if (refusal) return json({ error: refusal }, 400)

  const seq = (events.length ? events[events.length - 1].seq : 0) + 1
  const { data: inserted, error: insErr } = await admin.from('match_events').insert({
    match_id: match.id, seq, type: draft.type, side: draft.side,
    player_id: draft.player_id, player_name: draft.player_name,
    player2_id: draft.player2_id, player2_name: draft.player2_name,
    data: draft.data, created_by: staff.id, created_at: draft.created_at,
  }).select('seq').single()
  if (insErr || !inserted) {
    // A unique (match_id, seq) clash means another write got in first.
    return json({ error: 'Someone else has changed this match. It has been reloaded.', ...(await reload(admin, match.id)) }, 409)
  }

  events = [...events, { ...draft, seq, voided_at: null, edited_at: null } as EventRow]
  const state = computeBoard(sport, score.settings, liveEvents(events), teams)
  const endedAt = body.action === 'end' ? new Date(now).toISOString() : score.ended_at
  const saved = await save(admin, score, { state, ended_at: endedAt })
  if (!saved) {
    await admin.from('match_events').delete().eq('match_id', match.id).eq('seq', seq)
    return json({ error: 'Someone else has changed this match. It has been reloaded.', ...(await reload(admin, match.id)) }, 409)
  }
  score = saved

  if (body.action === 'end') {
    const at = new Date(now).toISOString()
    await admin.from('matches').update({ status: 'completed', updated_at: at }).eq('id', match.id)
    // No new bets on a finished match. Settling is still the admin's tap.
    await admin.from('markets').update({ status: 'closed', updated_at: at }).eq('match_id', match.id).eq('status', 'open')
  }
  return json(fresh())
}

function blank(type: string, side: Side | null, nowMs: number): ScoreEvent {
  return {
    seq: 0, type, side,
    player_id: null, player_name: null, player2_id: null, player2_name: null,
    data: {}, created_at: new Date(nowMs).toISOString(),
  }
}

/** The squad player for an id, null for no player, false for a stranger. */
function resolvePlayer(squads: Squads, id: string | null) {
  if (!id) return null
  return [...squads.a, ...squads.b].find(p => p.id === id) ?? false
}

/** Write a change only if nobody else has written since this version was read. */
async function save(admin: SupabaseClient, score: ScoreRow, patch: Record<string, unknown>): Promise<ScoreRow | null> {
  const { data } = await admin
    .from('match_scores')
    .update({ ...patch, version: score.version + 1, updated_at: new Date().toISOString() })
    .eq('match_id', score.match_id)
    .eq('version', score.version)
    .select('*')
    .maybeSingle()
  return (data as ScoreRow | null) ?? null
}

async function reload(admin: SupabaseClient, matchId: string) {
  const [score, events] = await Promise.all([loadScore(admin, matchId), loadEvents(admin, matchId)])
  return { score, events }
}

export type { Staff }
