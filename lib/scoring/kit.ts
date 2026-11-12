// ── Small shared pieces every sport's scoring function uses ─
import type { SportType } from '@/lib/sports'
import type { FeedLine, Scoreboard, ScoreEvent, Side } from './types'

const FEED_CAP = 60

export function emptyBoard(sport: SportType): Scoreboard {
  return {
    sport,
    phase: 'live',
    status: 'Not started',
    score: { a: '0', b: '0' },
    sub: { a: null, b: null },
    totals: { a: 0, b: 0 },
    clock: null,
    complete: false,
    winner: null,
    result: null,
    detail: {},
    players: {},
    first_scorer: null,
    feed: [],
  }
}

/** Add to a player's running total, creating their line on first sight. */
export function addStat(
  board: Scoreboard,
  id: string | null,
  name: string | null,
  side: Side,
  stat: string,
  n = 1,
) {
  if (!id) return
  const line = (board.players[id] ??= { id, name: name ?? 'Unknown', side, stats: {} })
  line.stats[stat] = (line.stats[stat] ?? 0) + n
}

export function pushFeed(
  board: Scoreboard,
  e: ScoreEvent,
  kind: string,
  text: string,
  tag: string | null = null,
) {
  const line: FeedLine = { seq: e.seq, kind, side: e.side, text, tag, at: e.created_at }
  board.feed.push(line)
}

/** Feed is built oldest-first; screens want newest-first and a bounded size. */
export function seal(board: Scoreboard): Scoreboard {
  board.feed = board.feed.slice(-FEED_CAP).reverse()
  return board
}

export const leader = (a: number, b: number): Side | 'draw' =>
  a > b ? 'a' : b > a ? 'b' : 'draw'

/** Read a whole number out of untrusted settings, clamped to a range. */
export function int(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export const obj = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

export const ENDED = 'The match has ended'
export const DECIDED = 'The match is already decided. End it, or undo the last entry.'
