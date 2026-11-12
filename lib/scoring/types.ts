// ── Shared shapes for live scoring ─────────────────────────
// A match's record is a list of ScoreEvents. Each sport has a pure function
// that turns settings + events into a Scoreboard. Nothing here touches the
// database, so every rule can be tested without one.
import type { SportType } from '@/lib/sports'

export type Side = 'a' | 'b'
export const other = (s: Side): Side => (s === 'a' ? 'b' : 'a')

export interface Teams { a: string; b: string }

export interface ScoreEvent {
  seq: number
  type: string
  side: Side | null
  player_id: string | null
  player_name: string | null
  player2_id: string | null
  player2_name: string | null
  data: Record<string, unknown>
  created_at: string
}

/** One line of the running feed shown under the score. */
export interface FeedLine {
  seq: number
  kind: string
  side: Side | null
  text: string
  /** Where in the match it happened: "12.4", "45+2'", "Set 2", "Q3". */
  tag: string | null
  at: string
}

export interface PlayerLine {
  id: string
  name: string
  side: Side
  stats: Record<string, number>
}

/**
 * A running clock costs no writes: screens tick locally from these values.
 * Shown time = base_s + banked_s + (running ? now - started_at : 0).
 */
export interface ClockState {
  running: boolean
  started_at: string | null
  banked_s: number
  base_s: number
}

export interface Scoreboard {
  sport: SportType
  phase: 'live' | 'finished'
  /** Human status line: "2nd half", "Innings break", "Set 3", "Q2". */
  status: string
  /** Headline score per side, already formatted: "87/3", "2", "1". */
  score: { a: string; b: string }
  /** Smaller line under each score: "(12.4 ov)", current set points. */
  sub: { a: string | null; b: string | null }
  /** Plain numbers behind the headline: runs, goals, points, sets, frames. */
  totals: { a: number; b: number }
  clock: ClockState | null
  /** The sport's own rules say the contest is decided. */
  complete: boolean
  winner: Side | 'draw' | null
  result: string | null
  /** Sport-specific detail; each sport module exports its own type for it. */
  detail: Record<string, unknown>
  players: Record<string, PlayerLine>
  /** Football only: scorer of the first goal that was not an own goal. */
  first_scorer: { id: string | null; name: string } | null
  /** Most recent first, capped. */
  feed: FeedLine[]
}

export interface SportModule<S> {
  settings(raw: unknown): S
  reduce(settings: S, events: ScoreEvent[], teams: Teams): Scoreboard
  /** Why a new entry may not be added right now, or null if it may. */
  check(board: Scoreboard, settings: S, event: ScoreEvent): string | null
}
