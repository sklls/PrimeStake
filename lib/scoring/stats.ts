// ── Fantasy stat rows filled from the referee's record ─────
// Saves and clean sheets are not in the record, so they are not returned:
// the admin's grid keeps whatever is already entered for those.
import type { Scoreboard } from './types'

export interface FantasyRow {
  player_id: string
  played: boolean
  runs?: number
  sixes?: number
  wickets?: number
  catches?: number
  run_outs?: number
  goals?: number
  assists?: number
  yellows?: number
  reds?: number
}

export function fantasyStats(sport: string, board: Scoreboard): FantasyRow[] {
  return Object.values(board.players).map(p => {
    const n = (k: string) => p.stats[k] ?? 0
    if (sport === 'cricket') {
      return {
        player_id: p.id, played: true,
        runs: n('runs'), sixes: n('sixes'), wickets: n('wickets'),
        catches: n('catches'), run_outs: n('run_outs'),
      }
    }
    return {
      player_id: p.id, played: true,
      goals: n('goals'), assists: n('assists'),
      // The stat grid caps these at what one player can collect in a match.
      yellows: Math.min(2, n('yellows')), reds: Math.min(1, n('reds')),
    }
  })
}
