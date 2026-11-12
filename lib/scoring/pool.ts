// ── Pool: frame by frame, a race to N ──────────────────────
import type { Scoreboard, ScoreEvent, SportModule, Teams } from './types'
import { addStat, emptyBoard, int, leader, obj, pushFeed, seal, DECIDED, ENDED } from './kit'

export interface PoolSettings { race_to: number }
export interface PoolDetail { race_to: number; frames: ('a' | 'b')[] }

function settings(raw: unknown): PoolSettings {
  return { race_to: int(obj(raw).race_to, 3, 1, 15) }
}

function reduce(s: PoolSettings, events: ScoreEvent[], teams: Teams): Scoreboard {
  const board = emptyBoard('pool')
  const frames: ('a' | 'b')[] = []
  let decided = false

  for (const e of events) {
    if (e.type === 'end_match') { board.phase = 'finished'; continue }
    if (!e.side) continue

    if (e.type === 'foul') {
      addStat(board, e.player_id, e.player_name, e.side, 'fouls')
      pushFeed(board, e, 'foul', `Foul by ${e.player_name ?? teams[e.side]}`, `Frame ${frames.length + 1}`)
      continue
    }
    if (e.type !== 'frame' || decided) continue

    frames.push(e.side)
    board.totals[e.side]++
    addStat(board, e.player_id, e.player_name, e.side, 'frames')
    pushFeed(
      board, e, 'frame',
      `Frame to ${teams[e.side]} · ${board.totals.a}-${board.totals.b}`,
      `Frame ${frames.length}`,
    )
    if (board.totals[e.side] >= s.race_to) decided = true
  }

  const detail: PoolDetail = { race_to: s.race_to, frames }
  board.detail = detail as unknown as Record<string, unknown>
  board.score = { a: String(board.totals.a), b: String(board.totals.b) }
  board.complete = decided
  board.status = decided ? 'Match over' : `Frame ${frames.length + 1} · race to ${s.race_to}`

  if (decided || board.phase === 'finished') {
    const w = leader(board.totals.a, board.totals.b)
    board.winner = w
    const hi = Math.max(board.totals.a, board.totals.b)
    const lo = Math.min(board.totals.a, board.totals.b)
    board.result = w === 'draw' ? `Level at ${hi}-${lo}` : `${teams[w]} won ${hi}-${lo}`
  }
  return seal(board)
}

function check(board: Scoreboard, _s: PoolSettings, e: ScoreEvent): string | null {
  if (board.phase === 'finished') return ENDED
  if (e.type === 'end_match') return null
  if (e.type !== 'frame' && e.type !== 'foul') return 'Unknown entry'
  if (!e.side) return 'Choose a side'
  if (e.type === 'frame' && board.complete) return DECIDED
  return null
}

export const pool: SportModule<PoolSettings> = { settings, reduce, check }
