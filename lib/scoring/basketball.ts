// ── Basketball: points and fouls by player, in periods ─────
import type { Scoreboard, ScoreEvent, SportModule, Teams } from './types'
import { addStat, emptyBoard, int, leader, obj, pushFeed, seal, DECIDED, ENDED } from './kit'

export interface BasketballSettings { periods: number }

export interface BasketballDetail {
  /** The period now being played (1-based), counting overtime periods on. */
  period: number
  periods: number
  by_period: { a: number; b: number }[]
  /** Team fouls in the current period only. */
  team_fouls: { a: number; b: number }
}

function settings(raw: unknown): BasketballSettings {
  return { periods: int(obj(raw).periods, 4, 1, 4) }
}

const label = (period: number, regulation: number) =>
  period <= regulation
    ? (regulation === 2 ? `Half ${period}` : `Q${period}`)
    : `OT${period - regulation}`

function reduce(s: BasketballSettings, events: ScoreEvent[], teams: Teams): Scoreboard {
  const board = emptyBoard('basketball')
  const byPeriod: { a: number; b: number }[] = [{ a: 0, b: 0 }]
  let teamFouls = { a: 0, b: 0 }
  let period = 1
  let decided = false

  for (const e of events) {
    if (e.type === 'end_match') { board.phase = 'finished'; continue }
    if (decided) continue
    const tag = label(period, s.periods)

    if (e.type === 'period_end') {
      pushFeed(board, e, 'period', `End of ${tag} · ${board.totals.a}-${board.totals.b}`, tag)
      // Regulation (or an overtime period) over with a leader: that is the game.
      if (period >= s.periods && board.totals.a !== board.totals.b) { decided = true; continue }
      period++
      byPeriod.push({ a: 0, b: 0 })
      teamFouls = { a: 0, b: 0 }
      continue
    }
    if (!e.side) continue

    if (e.type === 'points') {
      const value = Number(e.data.value)
      if (value !== 1 && value !== 2 && value !== 3) continue
      board.totals[e.side] += value
      byPeriod[byPeriod.length - 1][e.side] += value
      addStat(board, e.player_id, e.player_name, e.side, 'points', value)
      pushFeed(
        board, e, 'points',
        `+${value} ${e.player_name ?? teams[e.side]} · ${board.totals.a}-${board.totals.b}`,
        tag,
      )
    } else if (e.type === 'foul') {
      teamFouls[e.side]++
      addStat(board, e.player_id, e.player_name, e.side, 'fouls')
      pushFeed(board, e, 'foul', `Foul on ${e.player_name ?? teams[e.side]}`, tag)
    }
  }

  const detail: BasketballDetail = { period, periods: s.periods, by_period: byPeriod, team_fouls: teamFouls }
  board.detail = detail as unknown as Record<string, unknown>
  board.score = { a: String(board.totals.a), b: String(board.totals.b) }
  board.complete = decided
  board.status = decided ? 'Full time' : label(period, s.periods)

  if (decided || board.phase === 'finished') {
    const w = leader(board.totals.a, board.totals.b)
    board.winner = w
    const hi = Math.max(board.totals.a, board.totals.b)
    const lo = Math.min(board.totals.a, board.totals.b)
    board.result = w === 'draw' ? `Level at ${hi}-${lo}` : `${teams[w]} won ${hi}-${lo}`
  }
  return seal(board)
}

function check(board: Scoreboard, _s: BasketballSettings, e: ScoreEvent): string | null {
  if (board.phase === 'finished') return ENDED
  if (e.type === 'end_match') return null
  if (!['points', 'foul', 'period_end'].includes(e.type)) return 'Unknown entry'
  if (board.complete) return DECIDED
  if (e.type !== 'period_end' && !e.side) return 'Choose a side'
  if (e.type === 'points' && ![1, 2, 3].includes(Number(e.data.value))) return 'Points must be 1, 2 or 3'
  return null
}

export const basketball: SportModule<BasketballSettings> = { settings, reduce, check }
