// ── Football: goal by goal, on a stopwatch ─────────────────
import type { ClockState, Scoreboard, ScoreEvent, Side, SportModule, Teams } from './types'
import { other } from './types'
import { addStat, emptyBoard, int, leader, obj, pushFeed, seal, ENDED } from './kit'

export type Period = '1H' | '2H' | 'ET1' | 'ET2'
const ORDER: Period[] = ['1H', '2H', 'ET1', 'ET2']

export interface FootballSettings { half_minutes: number; et_minutes: number }

export interface Shootout { a: number; b: number; kicks_a: number; kicks_b: number; decided: boolean }

export interface FootballDetail {
  /** The period under way, or the last one played. */
  period: Period | null
  /** A period is under way (its clock may still be paused). */
  in_play: boolean
  /** What the referee could start next, if anything. */
  next_period: Period | null
  /** Added minutes announced for the period under way. */
  added: number | null
  shootout: Shootout | null
}

function settings(raw: unknown): FootballSettings {
  const r = obj(raw)
  return {
    half_minutes: int(r.half_minutes, 45, 1, 60),
    et_minutes: int(r.et_minutes, 15, 1, 30),
  }
}

/** Where a period's clock starts, in seconds: 0, 45:00, 90:00, 105:00. */
function baseOf(period: Period, s: FootballSettings): number {
  const half = s.half_minutes * 60
  const et = s.et_minutes * 60
  return period === '1H' ? 0 : period === '2H' ? half : period === 'ET1' ? half * 2 : half * 2 + et
}
const lengthOf = (period: Period, s: FootballSettings) =>
  (period === '1H' || period === '2H' ? s.half_minutes : s.et_minutes) * 60

/** What the clock reads, in whole seconds, at a given moment. */
export function clockSeconds(clock: ClockState | null, nowMs: number): number {
  if (!clock) return 0
  const live = clock.running && clock.started_at
    ? Math.max(0, Math.floor((nowMs - Date.parse(clock.started_at)) / 1000))
    : 0
  return clock.base_s + clock.banked_s + live
}

/** "3'" inside the period, "45+2'" once it has run past its scheduled end. */
export function minuteLabel(clockS: number, period: Period, s: FootballSettings): string {
  const end = baseOf(period, s) + lengthOf(period, s)
  if (clockS < end) return `${Math.floor(clockS / 60) + 1}'`
  return `${end / 60}+${Math.floor((clockS - end) / 60) + 1}'`
}

const PLAYING: Record<Period, string> = {
  '1H': '1st half', '2H': '2nd half',
  ET1: 'Extra time, 1st half', ET2: 'Extra time, 2nd half',
}
const BREAK: Record<Period, string> = {
  '1H': 'Half time', '2H': 'Full time',
  ET1: 'Extra time break', ET2: 'After extra time',
}

function shootoutDecided(so: Shootout): boolean {
  const { a, b, kicks_a: ka, kicks_b: kb } = so
  if (ka <= 5 && kb <= 5 && (ka < 5 || kb < 5)) {
    // Inside the first five: over once one side cannot be caught.
    return a > b + (5 - kb) || b > a + (5 - ka)
  }
  // Five each, then sudden death: decided whenever kicks are level and scores are not.
  return ka === kb && a !== b
}

function reduce(s: FootballSettings, events: ScoreEvent[], teams: Teams): Scoreboard {
  const board = emptyBoard('football')
  let period: Period | null = null
  let inPlay = false
  let added: number | null = null
  let shootout: Shootout | null = null
  const clock: ClockState = { running: false, started_at: null, banked_s: 0, base_s: 0 }

  const bank = (at: unknown) => {
    if (clock.running && clock.started_at && typeof at === 'string') {
      clock.banked_s += Math.max(0, Math.floor((Date.parse(at) - Date.parse(clock.started_at)) / 1000))
    }
    clock.running = false
    clock.started_at = null
  }
  const stamp = (e: ScoreEvent) =>
    period && typeof e.data.clock_s === 'number' ? minuteLabel(e.data.clock_s, period, s) : null

  for (const e of events) {
    switch (e.type) {
      case 'end_match':
        board.phase = 'finished'
        break

      case 'period_start': {
        const p = e.data.period as Period
        if (!ORDER.includes(p)) break
        period = p
        inPlay = true
        added = null
        clock.base_s = baseOf(p, s)
        clock.banked_s = 0
        clock.running = true
        clock.started_at = typeof e.data.at === 'string' ? e.data.at : e.created_at
        pushFeed(board, e, 'period', `${PLAYING[p]} under way`, `${clock.base_s / 60}'`)
        break
      }
      case 'period_end':
        if (!period || !inPlay) break
        bank(e.data.at)
        inPlay = false
        pushFeed(board, e, 'period', `${BREAK[period]} · ${board.totals.a}-${board.totals.b}`, null)
        break

      case 'clock_pause':
        if (inPlay && clock.running) bank(e.data.at)
        break
      case 'clock_resume':
        if (inPlay && !clock.running) {
          clock.running = true
          clock.started_at = typeof e.data.at === 'string' ? e.data.at : e.created_at
        }
        break

      case 'added_time':
        added = int(e.data.minutes, 0, 0, 30)
        pushFeed(board, e, 'added', `${added} added minute${added === 1 ? '' : 's'}`, null)
        break

      case 'goal': {
        if (!e.side) break
        board.totals[e.side]++
        const own = e.data.own_goal === true
        const score = `${board.totals.a}-${board.totals.b}`
        if (own) {
          // The side is whoever benefits; the player belongs to the other team.
          addStat(board, e.player_id, e.player_name, other(e.side), 'own_goals')
          pushFeed(board, e, 'goal', `GOAL ${teams[e.side]} · own goal${e.player_name ? ` (${e.player_name})` : ''} · ${score}`, stamp(e))
        } else {
          addStat(board, e.player_id, e.player_name, e.side, 'goals')
          addStat(board, e.player2_id, e.player2_name, e.side, 'assists')
          if (!board.first_scorer) {
            board.first_scorer = { id: e.player_id, name: e.player_name ?? teams[e.side] }
          }
          const how = e.data.penalty === true ? ' (pen)' : ''
          const assist = e.player2_name ? `, assist ${e.player2_name}` : ''
          pushFeed(board, e, 'goal', `GOAL ${e.player_name ?? teams[e.side]}${how}${assist} · ${score}`, stamp(e))
        }
        break
      }

      case 'yellow': {
        if (!e.side) break
        addStat(board, e.player_id, e.player_name, e.side, 'yellows')
        const second = e.player_id ? board.players[e.player_id]?.stats.yellows === 2 : false
        if (second) addStat(board, e.player_id, e.player_name, e.side, 'reds')
        pushFeed(
          board, e, second ? 'red' : 'yellow',
          second
            ? `Second yellow, sent off: ${e.player_name ?? teams[e.side]}`
            : `Yellow card: ${e.player_name ?? teams[e.side]}`,
          stamp(e),
        )
        break
      }
      case 'red':
        if (!e.side) break
        addStat(board, e.player_id, e.player_name, e.side, 'reds')
        pushFeed(board, e, 'red', `Red card: ${e.player_name ?? teams[e.side]}`, stamp(e))
        break
      case 'foul':
        if (!e.side) break
        addStat(board, e.player_id, e.player_name, e.side, 'fouls')
        pushFeed(board, e, 'foul', `Foul by ${e.player_name ?? teams[e.side]}`, stamp(e))
        break

      case 'shootout_start':
        if (!shootout) {
          shootout = { a: 0, b: 0, kicks_a: 0, kicks_b: 0, decided: false }
          pushFeed(board, e, 'period', 'Penalty shootout', null)
        }
        break
      case 'pen': {
        if (!shootout || !e.side || shootout.decided) break
        const scored = e.data.scored === true
        if (e.side === 'a') { shootout.kicks_a++; if (scored) shootout.a++ }
        else { shootout.kicks_b++; if (scored) shootout.b++ }
        shootout.decided = shootoutDecided(shootout)
        pushFeed(
          board, e, scored ? 'goal' : 'miss',
          `${scored ? 'Scored' : 'Missed'}: ${e.player_name ?? teams[e.side]} · ${shootout.a}-${shootout.b}`,
          'Pens',
        )
        break
      }
    }
  }

  const level = board.totals.a === board.totals.b
  const breakAfter = period && !inPlay ? period : null
  let next: Period | null = null
  if (!shootout && !inPlay) {
    if (!period) next = '1H'
    else if (period === '1H') next = '2H'
    else if (period === '2H' && level) next = 'ET1'
    else if (period === 'ET1') next = 'ET2'
  }

  const detail: FootballDetail = { period, in_play: inPlay, next_period: next, added, shootout }
  board.detail = detail as unknown as Record<string, unknown>
  board.clock = period ? clock : null
  board.score = { a: String(board.totals.a), b: String(board.totals.b) }
  if (shootout) board.sub = { a: `(${shootout.a} pens)`, b: `(${shootout.b} pens)` }

  board.status = shootout
    ? 'Penalties'
    : inPlay && period ? PLAYING[period]
    : breakAfter ? BREAK[breakAfter]
    : 'Not started'

  // Decided once regulation or extra time has ended with a leader, or the
  // shootout is beyond reach.
  const playedOut = breakAfter === '2H' || breakAfter === 'ET2'
  board.complete = shootout ? shootout.decided : playedOut && !level

  if (playedOut || shootout || board.phase === 'finished') {
    const score = `${Math.max(board.totals.a, board.totals.b)}-${Math.min(board.totals.a, board.totals.b)}`
    if (!level) {
      const w = leader(board.totals.a, board.totals.b) as Side
      board.winner = w
      board.result = `${teams[w]} won ${score}`
    } else if (shootout && shootout.a !== shootout.b && (shootout.decided || board.phase === 'finished')) {
      const w: Side = shootout.a > shootout.b ? 'a' : 'b'
      board.winner = w
      const pens = `${Math.max(shootout.a, shootout.b)}-${Math.min(shootout.a, shootout.b)}`
      board.result = `${teams[w]} won ${pens} on penalties (${score})`
    } else {
      board.winner = 'draw'
      board.result = `Draw ${score}`
    }
  }
  return seal(board)
}

function check(board: Scoreboard, _s: FootballSettings, e: ScoreEvent): string | null {
  if (board.phase === 'finished') return ENDED
  const d = board.detail as unknown as FootballDetail
  const started = d.period !== null

  switch (e.type) {
    case 'end_match':
      return d.in_play ? 'End the period first' : null
    case 'period_start':
      if (d.in_play) return 'A period is already under way'
      if (e.data.period !== d.next_period) return 'That period cannot start now'
      return null
    case 'period_end':
      return d.in_play ? null : 'No period is under way'
    case 'clock_pause':
      return d.in_play && board.clock?.running ? null : 'The clock is not running'
    case 'clock_resume':
      return d.in_play && !board.clock?.running ? null : 'The clock is already running'
    case 'added_time':
      return d.in_play ? null : 'No period is under way'
    case 'goal': case 'yellow': case 'red': case 'foul':
      if (!started) return 'Kick off first'
      if (d.shootout) return 'The shootout has started. Enter kicks instead.'
      return e.side ? null : 'Choose a side'
    case 'shootout_start':
      if (!started || d.in_play) return 'End the period first'
      if (d.shootout) return 'The shootout has already started'
      if (board.totals.a !== board.totals.b) return 'A shootout needs the scores level'
      return null
    case 'pen':
      if (!d.shootout) return 'Start the shootout first'
      if (d.shootout.decided) return 'The shootout is decided'
      return e.side ? null : 'Choose a side'
    default:
      return 'Unknown entry'
  }
}

export const football: SportModule<FootballSettings> = { settings, reduce, check }
