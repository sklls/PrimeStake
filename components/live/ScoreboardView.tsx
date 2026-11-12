'use client'

import { useEffect, useState } from 'react'
import type { Scoreboard, Side, Teams } from '@/lib/scoring/types'
import type { CricketDetail } from '@/lib/scoring/cricket'
import type { FootballDetail } from '@/lib/scoring/football'
import { clockSeconds } from '@/lib/scoring/football'
import type { SetsDetail } from '@/lib/scoring/sets'
import type { BasketballDetail } from '@/lib/scoring/basketball'
import type { PoolDetail } from '@/lib/scoring/pool'

/** Re-render once a second while something on screen is ticking. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const FEED_STYLE: Record<string, string> = {
  goal: 'text-amber', boundary: 'text-amber', wicket: 'text-crimson-light',
  red: 'text-crimson-light', yellow: 'text-gold', set: 'text-amber', frame: 'text-white',
  period: 'text-slate', info: 'text-slate', miss: 'text-slate',
}

export default function ScoreboardView({
  board, teams, showFeed = true, feedLimit = 30,
}: {
  board: Scoreboard
  teams: Teams
  showFeed?: boolean
  feedLimit?: number
}) {
  const ticking = Boolean(board.clock?.running) && board.phase === 'live'
  const now = useNow(ticking)
  const finished = board.phase === 'finished'
  const highlight: Side | null =
    board.sport === 'cricket' ? ((board.detail as unknown as CricketDetail).batting ?? null) : null

  return (
    <div className="bg-table border border-rail rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-rail">
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
          finished ? 'bg-rail text-slate' : 'bg-crimson text-white'
        }`}>
          {finished ? 'FINAL' : 'LIVE'}
        </span>
        <span className="text-xs text-slate">{board.status}</span>
        {board.clock ? (
          <span className="text-sm font-mono font-semibold text-white" suppressHydrationWarning>
            {mmss(clockSeconds(board.clock, now))}
            {board.sport === 'football' && (board.detail as unknown as FootballDetail).added
              ? <span className="text-gold"> +{(board.detail as unknown as FootballDetail).added}</span>
              : null}
            {!board.clock.running && !finished && <span className="text-slate text-xs"> ⏸</span>}
          </span>
        ) : <span className="w-10" />}
      </div>

      <div className="grid grid-cols-2 divide-x divide-rail">
        {(['a', 'b'] as Side[]).map(side => (
          <div key={side} className={`px-4 py-4 text-center ${highlight === side ? 'bg-raised/60' : ''}`}>
            <p className="text-sm font-medium text-slate truncate">
              {teams[side]}
              {highlight === side && <span className="ml-1 text-amber" title="Batting">●</span>}
            </p>
            <p className="text-4xl font-bold text-white tabular-nums leading-tight mt-1">
              {board.score[side] || '–'}
            </p>
            {board.sub[side] && <p className="text-xs text-slate mt-0.5">{board.sub[side]}</p>}
          </div>
        ))}
      </div>

      <SportDetail board={board} teams={teams} />

      {board.result && (
        <p className="px-4 py-2 text-center text-sm font-semibold text-amber border-t border-rail">{board.result}</p>
      )}

      {showFeed && board.feed.length > 0 && (
        <ul className="border-t border-rail max-h-80 overflow-y-auto divide-y divide-rail/50">
          {board.feed.slice(0, feedLimit).map((line, i) => (
            <li key={`${line.seq}-${i}`} className="px-4 py-2 flex gap-3 text-sm">
              <span className="w-12 shrink-0 text-xs text-slate tabular-nums pt-0.5">{line.tag ?? ''}</span>
              <span className={`flex-1 ${FEED_STYLE[line.kind] ?? 'text-white'}`}>{line.text}</span>
              <span className="text-xs text-slate-faded shrink-0 pt-0.5" suppressHydrationWarning>
                {new Date(line.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SportDetail({ board, teams }: { board: Scoreboard; teams: Teams }) {
  const box = 'px-4 py-3 border-t border-rail text-sm'

  if (board.sport === 'cricket') {
    const d = board.detail as unknown as CricketDetail
    if (!d.innings) return null
    const bat = (id: string | undefined) => (id ? board.players[id] : undefined)
    const s = bat(d.striker?.id)
    const n = bat(d.non_striker?.id)
    const b = d.bowler ? board.players[d.bowler.id] : undefined
    const overs = (balls: number) => `${Math.floor(balls / 6)}.${balls % 6}`
    return (
      <div className={`${box} space-y-2`}>
        {d.open && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="space-y-0.5">
              {[s, n].map((p, i) => p && (
                <p key={p.id} className="text-white">
                  {p.name}{i === 0 && <span className="text-amber">*</span>}{' '}
                  <span className="text-slate">{p.stats.runs ?? 0} ({p.stats.balls ?? 0})</span>
                </p>
              ))}
            </div>
            {b && (
              <p className="text-right text-white">
                {b.name}{' '}
                <span className="text-slate">
                  {overs(b.stats.bowl_balls ?? 0)}-{b.stats.bowl_runs ?? 0}-{b.stats.wickets ?? 0}
                </span>
              </p>
            )}
          </div>
        )}
        {d.this_over.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {d.this_over.map((x, i) => (
              <span key={i} className={`min-w-7 px-1.5 h-7 rounded-full grid place-items-center text-xs font-semibold ${
                x === 'W' ? 'bg-crimson text-white' : x === '4' || x === '6' ? 'bg-amber text-white' : 'bg-raised text-white'
              }`}>{x}</span>
            ))}
          </div>
        )}
        {d.need && (
          <p className="text-xs text-gold">
            {teams[d.batting as Side]} need {d.need.runs} from {d.need.balls} ball{d.need.balls === 1 ? '' : 's'}
          </p>
        )}
        {!d.open && d.target !== null && !board.complete && (
          <p className="text-xs text-gold">Target {d.target}</p>
        )}
      </div>
    )
  }

  if (board.sport === 'football') {
    const d = board.detail as unknown as FootballDetail
    if (!d.shootout) return null
    return (
      <p className={`${box} text-center text-gold`}>
        Penalties {d.shootout.a}-{d.shootout.b} ({d.shootout.kicks_a} and {d.shootout.kicks_b} taken)
      </p>
    )
  }

  if (board.sport === 'volleyball' || board.sport === 'table_tennis') {
    const d = board.detail as unknown as SetsDetail
    if (!d.sets.length) return <p className={`${box} text-center text-xs text-slate`}>First to {d.sets_to_win} set{d.sets_to_win === 1 ? '' : 's'} · set to {d.target}</p>
    return (
      <div className={`${box} flex flex-wrap justify-center gap-2`}>
        {d.sets.map((set, i) => (
          <span key={i} className="px-2 py-1 rounded bg-raised text-xs text-white tabular-nums">
            <span className="text-slate">S{i + 1}</span> {set.a}-{set.b}
          </span>
        ))}
      </div>
    )
  }

  if (board.sport === 'basketball') {
    const d = board.detail as unknown as BasketballDetail
    return (
      <div className={`${box} flex items-center justify-between gap-2 text-xs`}>
        <div className="flex flex-wrap gap-1">
          {d.by_period.map((p, i) => (
            <span key={i} className="px-2 py-1 rounded bg-raised text-white tabular-nums">
              <span className="text-slate">{i < d.periods ? (d.periods === 2 ? `H${i + 1}` : `Q${i + 1}`) : `OT${i + 1 - d.periods}`}</span> {p.a}-{p.b}
            </span>
          ))}
        </div>
        <span className="text-slate shrink-0">Fouls {d.team_fouls.a}-{d.team_fouls.b}</span>
      </div>
    )
  }

  if (board.sport === 'pool') {
    const d = board.detail as unknown as PoolDetail
    return <p className={`${box} text-center text-xs text-slate`}>Race to {d.race_to}</p>
  }
  return null
}
