// ── Volleyball and table tennis: point by point, in sets ───
import type { SportType } from '@/lib/sports'
import type { Scoreboard, ScoreEvent, Side, SportModule, Teams } from './types'
import { addStat, emptyBoard, int, leader, obj, pushFeed, seal, DECIDED, ENDED } from './kit'

export interface SetsSettings {
  best_of: number
  points: number
  /** Target for the deciding set, if it differs (volleyball plays it to 15). */
  decider_points: number | null
}

export interface SetScore { a: number; b: number; winner: Side }

export interface SetsDetail {
  sets: SetScore[]
  current: { a: number; b: number }
  set_no: number
  target: number
  sets_to_win: number
}

function makeModule(
  sport: SportType,
  defaults: { points: number; decider_points: number | null },
): SportModule<SetsSettings> {
  function settings(raw: unknown): SetsSettings {
    const r = obj(raw)
    const best = int(r.best_of, 3, 1, 7)
    return {
      // An even "best of" could finish level, so round up to the next odd.
      best_of: best % 2 === 0 ? best + 1 : best,
      points: int(r.points, defaults.points, 1, 50),
      decider_points:
        r.decider_points === null || (r.decider_points === undefined && defaults.decider_points === null)
          ? null
          : int(r.decider_points, defaults.decider_points ?? defaults.points, 1, 50),
    }
  }

  function reduce(s: SetsSettings, events: ScoreEvent[], teams: Teams): Scoreboard {
    const board = emptyBoard(sport)
    const need = Math.ceil(s.best_of / 2)
    const won = { a: 0, b: 0 }
    const sets: SetScore[] = []
    let cur = { a: 0, b: 0 }
    let decided = false
    const targetFor = (setNo: number) =>
      setNo === s.best_of && s.decider_points ? s.decider_points : s.points

    for (const e of events) {
      if (e.type === 'end_match') { board.phase = 'finished'; continue }
      if (e.type !== 'point' || !e.side || decided) continue

      cur[e.side]++
      board.totals[e.side]++
      addStat(board, e.player_id, e.player_name, e.side, 'points')

      const setNo = sets.length + 1
      const target = targetFor(setNo)
      const who = e.player_name ? `${e.player_name} (${teams[e.side]})` : teams[e.side]
      pushFeed(board, e, 'point', `Point ${who} · ${cur.a}-${cur.b}`, `Set ${setNo}`)

      const lead = Math.abs(cur.a - cur.b)
      if (Math.max(cur.a, cur.b) >= target && lead >= 2) {
        const winner = leader(cur.a, cur.b) as Side
        sets.push({ ...cur, winner })
        won[winner]++
        pushFeed(board, e, 'set', `${teams[winner]} take set ${setNo}, ${cur.a}-${cur.b}`, `Set ${setNo}`)
        cur = { a: 0, b: 0 }
        if (won[winner] >= need) decided = true
      }
    }

    const setNo = Math.min(sets.length + 1, s.best_of)
    const detail: SetsDetail = {
      sets, current: cur, set_no: setNo, target: targetFor(setNo), sets_to_win: need,
    }
    board.detail = detail as unknown as Record<string, unknown>
    board.score = { a: String(won.a), b: String(won.b) }
    board.sub = decided ? { a: null, b: null } : { a: String(cur.a), b: String(cur.b) }
    board.complete = decided
    board.status = decided ? 'Match over' : `Set ${setNo}`

    if (decided || board.phase === 'finished') {
      // Ended early: whoever is ahead on sets, then on points in the open set.
      const w = leader(won.a, won.b) !== 'draw' ? leader(won.a, won.b) : leader(cur.a, cur.b)
      board.winner = w
      board.result = w === 'draw'
        ? `Level at ${won.a}-${won.b}`
        : `${teams[w]} won ${Math.max(won.a, won.b)}-${Math.min(won.a, won.b)}`
    }
    return seal(board)
  }

  function check(board: Scoreboard, _s: SetsSettings, e: ScoreEvent): string | null {
    if (board.phase === 'finished') return ENDED
    if (e.type === 'end_match') return null
    if (e.type !== 'point') return 'Unknown entry'
    if (!e.side) return 'Choose which side won the point'
    if (board.complete) return DECIDED
    return null
  }

  return { settings, reduce, check }
}

export const volleyball = makeModule('volleyball', { points: 25, decider_points: 15 })
export const tableTennis = makeModule('table_tennis', { points: 11, decider_points: null })
