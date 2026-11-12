// ── Cricket: ball by ball, two limited-overs innings ───────
import type { Scoreboard, ScoreEvent, Side, SportModule, Teams } from './types'
import { other } from './types'
import { addStat, emptyBoard, int, obj, pushFeed, seal, DECIDED, ENDED } from './kit'

export interface CricketSettings { overs: number; wickets: number; bat_first: Side }

export interface Ref { id: string; name: string }

export interface InningsLine { side: Side; runs: number; wickets: number; balls: number; extras: number }

export interface CricketDetail {
  /** Innings started so far: 0, 1 or 2. */
  innings: number
  batting: Side | null
  /** An innings is under way. */
  open: boolean
  striker: Ref | null
  non_striker: Ref | null
  bowler: Ref | null
  /** Next thing the referee must choose before the next ball. */
  need_pair: boolean
  need_batter: boolean
  need_bowler: boolean
  /** Runs the side batting second needs to win, once the first innings is done. */
  target: number | null
  need: { runs: number; balls: number } | null
  innings_list: InningsLine[]
  /** Symbols for the over in progress: "1", "4", "W", "wd". */
  this_over: string[]
  overs: number
  wickets: number
  /** Bowled the previous over, so may not bowl this one. */
  last_bowler: string | null
}

export const WICKET_KINDS = ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket'] as const
export const EXTRAS = ['wide', 'noball', 'bye', 'legbye'] as const
const BOWLER_WICKETS = new Set(['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'])
const KIND_TEXT: Record<string, string> = {
  bowled: 'bowled', caught: 'caught', lbw: 'lbw', run_out: 'run out',
  stumped: 'stumped', hit_wicket: 'hit wicket',
}

function settings(raw: unknown): CricketSettings {
  const r = obj(raw)
  return {
    overs: int(r.overs, 10, 1, 50),
    wickets: int(r.wickets, 10, 1, 10),
    bat_first: r.bat_first === 'b' ? 'b' : 'a',
  }
}

const oversText = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function reduce(s: CricketSettings, events: ScoreEvent[], teams: Teams): Scoreboard {
  const board = emptyBoard('cricket')
  const inns: InningsLine[] = []
  const maxBalls = s.overs * 6
  let open = false
  let decided = false
  let striker: Ref | null = null
  let non: Ref | null = null
  let bowler: Ref | null = null
  let lastBowler: string | null = null
  let thisOver: string[] = []

  const battingSide = (n: number): Side => (n === 1 ? s.bat_first : other(s.bat_first))
  const cur = () => inns[inns.length - 1]
  const ref = (id: string | null, name: string | null): Ref | null =>
    id ? { id, name: name ?? 'Unknown' } : null
  const enterBatter = (r: Ref | null) => {
    if (!r) return
    addStat(board, r.id, r.name, cur().side, 'runs', 0)
    addStat(board, r.id, r.name, cur().side, 'balls', 0)
  }
  const closeInnings = () => {
    open = false
    striker = non = bowler = null
    lastBowler = null
    thisOver = []
    if (inns.length === 2) decided = true
  }

  for (const e of events) {
    if (e.type === 'end_match') { board.phase = 'finished'; continue }
    if (decided) continue

    switch (e.type) {
      case 'batters': {
        if (!open) {
          if (inns.length >= 2) break
          inns.push({ side: battingSide(inns.length + 1), runs: 0, wickets: 0, balls: 0, extras: 0 })
          open = true
        }
        striker = ref(e.player_id, e.player_name)
        non = ref(e.player2_id, e.player2_name)
        enterBatter(striker)
        enterBatter(non)
        pushFeed(
          board, e, 'info',
          `${striker?.name ?? '?'} and ${non?.name ?? '?'} open for ${teams[cur().side]}`,
          null,
        )
        break
      }

      case 'bowler': {
        if (!open) break
        bowler = ref(e.player_id, e.player_name)
        if (bowler) {
          const side = other(cur().side)
          addStat(board, bowler.id, bowler.name, side, 'bowl_runs', 0)
          addStat(board, bowler.id, bowler.name, side, 'bowl_balls', 0)
          addStat(board, bowler.id, bowler.name, side, 'wickets', 0)
          pushFeed(board, e, 'info', `${bowler.name} to bowl`, oversText(cur().balls))
        }
        break
      }

      case 'new_batter': {
        if (!open) break
        const r = ref(e.player_id, e.player_name)
        if (!r) break
        if (!striker) striker = r
        else if (!non) non = r
        else break
        enterBatter(r)
        pushFeed(board, e, 'info', `${r.name} comes in`, oversText(cur().balls))
        break
      }

      case 'innings_end':
        if (!open) break
        pushFeed(board, e, 'info', `Innings closed at ${cur().runs}/${cur().wickets}`, oversText(cur().balls))
        closeInnings()
        break

      case 'ball': {
        if (!open || !striker || !non || !bowler) break
        const inn = cur()
        const bat = inn.side
        const bowl = other(bat)
        const runs = int(e.data.runs, 0, 0, 7)
        const extra = typeof e.data.extra === 'string' ? e.data.extra : null
        const wk = obj(e.data.wicket)
        const kind = typeof wk.kind === 'string' && WICKET_KINDS.includes(wk.kind as never) ? wk.kind : null
        const legal = extra !== 'wide' && extra !== 'noball'

        let teamRuns = runs
        let batRuns = 0
        let bowlRuns = 0
        let extras = 0
        if (extra === 'wide') { teamRuns = 1 + runs; bowlRuns = 1 + runs; extras = 1 + runs }
        else if (extra === 'noball') { teamRuns = 1 + runs; batRuns = runs; bowlRuns = 1 + runs; extras = 1 }
        else if (extra === 'bye' || extra === 'legbye') { extras = runs }
        else { batRuns = runs; bowlRuns = runs }

        const facing: Ref = striker
        const atOtherEnd: Ref = non
        const bowling: Ref = bowler

        inn.runs += teamRuns
        inn.extras += extras
        board.totals[bat] += teamRuns
        if (extra !== 'wide') addStat(board, facing.id, facing.name, bat, 'balls')
        if (batRuns) addStat(board, facing.id, facing.name, bat, 'runs', batRuns)
        if (batRuns === 4) addStat(board, facing.id, facing.name, bat, 'fours')
        if (batRuns === 6) addStat(board, facing.id, facing.name, bat, 'sixes')
        addStat(board, bowling.id, bowling.name, bowl, 'bowl_runs', bowlRuns)
        if (legal) {
          inn.balls++
          addStat(board, bowling.id, bowling.name, bowl, 'bowl_balls')
        }

        // Runs actually run swap the batters; the dismissal is applied after.
        if (runs % 2 === 1) { const t: Ref | null = striker; striker = non; non = t }

        let outText = ''
        if (kind) {
          const outRef = kind === 'run_out' && wk.who === 'non_striker' ? atOtherEnd : facing
          inn.wickets++
          addStat(board, outRef.id, outRef.name, bat, 'out')
          if (BOWLER_WICKETS.has(kind)) addStat(board, bowling.id, bowling.name, bowl, 'wickets')
          if (e.player2_id) {
            const credit = kind === 'caught' ? 'catches' : kind === 'run_out' ? 'run_outs' : kind === 'stumped' ? 'stumpings' : null
            if (credit) addStat(board, e.player2_id, e.player2_name, bowl, credit)
          }
          if (striker?.id === outRef.id) striker = null
          else if (non?.id === outRef.id) non = null
          const by = e.player2_name && kind !== 'bowled' && kind !== 'lbw' ? ` (${e.player2_name})` : ''
          outText = ` · OUT! ${outRef.name} ${KIND_TEXT[kind]}${by}`
        }

        const symbol = kind
          ? 'W'
          : extra === 'wide' ? `${runs ? runs + 1 : ''}wd`
          : extra === 'noball' ? `${runs ? runs : ''}nb`
          : extra === 'bye' ? `${runs}b`
          : extra === 'legbye' ? `${runs}lb`
          : runs === 0 ? '•' : String(runs)
        thisOver.push(symbol)

        const what =
          extra === 'wide' ? (runs ? `${plural(runs + 1, 'wide')}` : 'wide')
          : extra === 'noball' ? `no-ball${runs ? `, ${plural(runs, 'run')} off the bat` : ''}`
          : extra === 'bye' ? plural(runs, 'bye')
          : extra === 'legbye' ? plural(runs, 'leg bye')
          : batRuns === 4 ? 'FOUR' : batRuns === 6 ? 'SIX'
          : runs === 0 ? 'no run' : plural(runs, 'run')
        pushFeed(
          board, e, kind ? 'wicket' : batRuns >= 4 ? 'boundary' : 'ball',
          `${bowling.name} to ${facing.name}: ${what}${outText} · ${inn.runs}/${inn.wickets}`,
          oversText(inn.balls),
        )

        if (legal && inn.balls % 6 === 0) {
          const t: Ref | null = striker; striker = non; non = t
          lastBowler = bowling.id
          bowler = null
          thisOver = []
          pushFeed(board, e, 'info', `End of over ${inn.balls / 6} · ${inn.runs}/${inn.wickets}`, oversText(inn.balls))
        }

        const target = inns.length === 2 ? inns[0].runs + 1 : null
        if (target !== null && inn.runs >= target) closeInnings()
        else if (inn.wickets >= s.wickets) closeInnings()
        else if (inn.balls >= maxBalls) closeInnings()
        break
      }
    }
  }

  const firstDone = inns.length === 2 || (inns.length === 1 && !open)
  const target = firstDone ? inns[0].runs + 1 : null
  const second = inns.length === 2 ? inns[1] : null
  const lineFor = (side: Side) => inns.find(i => i.side === side)

  const detail: CricketDetail = {
    innings: inns.length,
    batting: inns.length ? cur().side : null,
    open,
    striker, non_striker: non, bowler,
    need_pair: !decided && !open && inns.length < 2,
    need_batter: open && (!striker || !non),
    need_bowler: open && !bowler,
    target,
    need: open && second && target !== null
      ? { runs: target - second.runs, balls: maxBalls - second.balls }
      : null,
    innings_list: inns,
    this_over: thisOver,
    overs: s.overs,
    wickets: s.wickets,
    last_bowler: lastBowler,
  }
  board.detail = detail as unknown as Record<string, unknown>

  for (const side of ['a', 'b'] as Side[]) {
    const l = lineFor(side)
    board.score[side] = l ? `${l.runs}/${l.wickets}` : ''
    board.sub[side] = l ? `(${oversText(l.balls)} ov)` : null
  }

  board.complete = decided
  board.status = decided ? 'Match over'
    : inns.length === 0 ? 'Not started'
    : open ? (inns.length === 1 ? '1st innings' : '2nd innings')
    : 'Innings break'

  if (decided && second) {
    const first = inns[0]
    if (second.runs > first.runs) {
      board.winner = second.side
      board.result = `${teams[second.side]} won by ${plural(s.wickets - second.wickets, 'wicket')}`
    } else if (second.runs < first.runs) {
      board.winner = first.side
      board.result = `${teams[first.side]} won by ${plural(first.runs - second.runs, 'run')}`
    } else {
      board.winner = 'draw'
      board.result = 'Match tied'
    }
  } else if (board.phase === 'finished') {
    board.result = 'No result'
  }
  return seal(board)
}

function check(board: Scoreboard, _s: CricketSettings, e: ScoreEvent): string | null {
  if (board.phase === 'finished') return ENDED
  if (e.type === 'end_match') return null
  if (board.complete) return DECIDED
  const d = board.detail as unknown as CricketDetail

  switch (e.type) {
    case 'batters':
      if (!d.open && d.innings_list.length >= 2) return 'Both innings are done'
      if (!e.player_id || !e.player2_id) return 'Choose both opening batters'
      if (e.player_id === e.player2_id) return 'Choose two different batters'
      return null
    case 'bowler':
      if (!d.open) return 'Choose the opening batters first'
      if (!e.player_id) return 'Choose the bowler'
      if (e.player_id === d.last_bowler) return 'The same bowler cannot bowl two overs in a row'
      return null
    case 'new_batter': {
      if (!d.open) return 'No innings is under way'
      if (!d.need_batter) return 'Both batters are already in'
      if (!e.player_id) return 'Choose the new batter'
      if (e.player_id === d.striker?.id || e.player_id === d.non_striker?.id) return 'That batter is already in'
      if (board.players[e.player_id]?.stats.out) return 'That batter is already out'
      return null
    }
    case 'innings_end':
      return d.open ? null : 'No innings is under way'
    case 'ball': {
      if (!d.open) return 'Choose the opening batters first'
      if (d.need_batter) return 'Bring in the new batter first'
      if (!d.bowler) return 'Choose the bowler first'
      const extra = e.data.extra
      if (extra != null && !EXTRAS.includes(extra as never)) return 'Unknown extra'
      const runs = Number(e.data.runs ?? 0)
      if (!Number.isInteger(runs) || runs < 0 || runs > 7) return 'Runs must be between 0 and 7'
      const wk = obj(e.data.wicket)
      if (e.data.wicket != null && !WICKET_KINDS.includes(wk.kind as never)) return 'Choose how the batter was out'
      return null
    }
    default:
      return 'Unknown entry'
  }
}

export const cricket: SportModule<CricketSettings> = { settings, reduce, check }
