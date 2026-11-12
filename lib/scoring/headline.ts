// ── What a scoreboard shows large, and what goes underneath ─
// In volleyball and table tennis the number people follow during play is the
// points in the set being played, not the sets won, so those lead while a set
// is in progress and the sets won sit underneath. Every other sport shows its
// score as it is.
import type { Scoreboard, Side } from './types'

export interface Headline {
  big: Record<Side, string>
  small: Record<Side, string | null>
}

const SET_SPORTS = new Set(['volleyball', 'table_tennis'])
const sets = (n: string) => `${n} ${n === '1' ? 'set' : 'sets'}`

export function headline(board: Scoreboard): Headline {
  if (!SET_SPORTS.has(board.sport)) return { big: board.score, small: board.sub }
  if (board.sub.a !== null && board.sub.b !== null) {
    return {
      big: { a: board.sub.a, b: board.sub.b },
      small: { a: sets(board.score.a), b: sets(board.score.b) },
    }
  }
  return { big: board.score, small: { a: 'sets', b: 'sets' } }
}
