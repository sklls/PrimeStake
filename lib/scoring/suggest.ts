// ── Suggested winners for the admin's settle screen ────────
// Only ever a suggestion: the admin still taps the winner, and nothing here
// moves credits. A suggestion is offered only when the referee has ended the
// match and the answer is unambiguous; otherwise the result is shown alone.
import type { Scoreboard, Teams } from './types'

export interface Suggestion { option_id: string | null; note: string | null }
export interface OptionRef { id: string; label: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** The stat that counts as "scoring" for a top-scorer market in each sport. */
const SCORE_STAT: Record<string, string> = {
  cricket: 'runs', football: 'goals', basketball: 'points',
  volleyball: 'points', table_tennis: 'points', pool: 'frames',
}

export function suggest(
  marketType: string,
  options: OptionRef[],
  board: Scoreboard,
  teams: Teams,
): Suggestion {
  const note = board.result
  if (board.phase !== 'finished') return { option_id: null, note }
  const find = (label: string) => options.find(o => norm(o.label) === norm(label))?.id ?? null

  switch (marketType) {
    case 'winner': {
      if (!board.winner) return { option_id: null, note }
      if (board.winner === 'draw') {
        const o = options.find(o => /^(draw|tie|tied)$/.test(norm(o.label)))
        return { option_id: o?.id ?? null, note }
      }
      return { option_id: find(teams[board.winner]), note }
    }

    case 'top_scorer': {
      const stat = SCORE_STAT[board.sport] ?? 'points'
      const ranked = Object.values(board.players)
        .map(p => ({ name: p.name, n: p.stats[stat] ?? 0 }))
        .filter(x => x.n > 0)
        .sort((a, b) => b.n - a.n)
      if (!ranked.length) return { option_id: null, note }
      if (ranked.length > 1 && ranked[0].n === ranked[1].n) {
        const level = ranked.filter(x => x.n === ranked[0].n).map(x => x.name).join(', ')
        return { option_id: null, note: `Top scorers level on ${ranked[0].n}: ${level}` }
      }
      return { option_id: find(ranked[0].name), note: `Top scorer: ${ranked[0].name} (${ranked[0].n})` }
    }

    case 'first_goal_scorer': {
      if (!board.first_scorer) return { option_id: null, note: 'No goal from open play' }
      return {
        option_id: find(board.first_scorer.name),
        note: `First goal: ${board.first_scorer.name}`,
      }
    }

    case 'over_under': {
      const total = board.totals.a + board.totals.b
      const withTotal = `${note ? `${note} · ` : ''}Total ${total}`
      let over: { id: string; n: number } | null = null
      let under: { id: string; n: number } | null = null
      for (const o of options) {
        const m = norm(o.label).match(/^(over|under)\s+(\d+(?:\.\d+)?)$/)
        if (!m) continue
        if (m[1] === 'over') over = { id: o.id, n: Number(m[2]) }
        else under = { id: o.id, n: Number(m[2]) }
      }
      if (!over || !under || over.n !== under.n || total === over.n) {
        return { option_id: null, note: withTotal }
      }
      return { option_id: total > over.n ? over.id : under.id, note: withTotal }
    }

    default:
      return { option_id: null, note }
  }
}
