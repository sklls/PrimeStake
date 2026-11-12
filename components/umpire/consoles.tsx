'use client'

// One scoring pad per sport. Each turns taps into entries via `send`; the
// server checks every entry against the rules and recomputes the score.

import { useState } from 'react'
import type { Side } from '@/lib/scoring/types'
import { other } from '@/lib/scoring/types'
import type { CricketDetail } from '@/lib/scoring/cricket'
import type { FootballDetail, Period } from '@/lib/scoring/football'
import { clockSeconds } from '@/lib/scoring/football'
import type { BasketballDetail } from '@/lib/scoring/basketball'
import { Pad, Prompt, playerOptions, type ConsoleProps, type Option } from './kit'

const SIDES: Side[] = ['a', 'b']
const nums = (ns: number[]): Option<number>[] => ns.map(n => ({ label: String(n), value: n }))

// ── Cricket ────────────────────────────────────────────────

const WICKETS: Option<string>[] = [
  { label: 'Bowled', value: 'bowled' }, { label: 'Caught', value: 'caught' },
  { label: 'LBW', value: 'lbw' }, { label: 'Run out', value: 'run_out' },
  { label: 'Stumped', value: 'stumped' }, { label: 'Hit wicket', value: 'hit_wicket' },
]

export function CricketConsole({ board, settings, teams, squads, busy, send, choose }: ConsoleProps) {
  const d = board.detail as unknown as CricketDetail
  const batFirst: Side = settings.bat_first === 'b' ? 'b' : 'a'
  const batting: Side = d.open && d.batting ? d.batting : d.innings_list.length === 0 ? batFirst : other(batFirst)
  const bowling = other(batting)
  const current = d.innings_list[d.innings_list.length - 1]
  const overNo = current && d.open ? Math.floor(current.balls / 6) + 1 : 1
  const outIds = new Set(
    Object.values(board.players).filter(p => p.side === batting && p.stats.out).map(p => p.id),
  )

  async function openingPair() {
    const s1 = await choose(`Striker for ${teams[batting]}`, playerOptions(squads[batting]))
    if (!s1) return
    const s2 = await choose('Non-striker', playerOptions(squads[batting].filter(p => p.id !== s1)))
    if (!s2) return
    await send({ type: 'batters', player_id: s1, player2_id: s2 })
  }

  async function newBatter() {
    const inIds = [d.striker?.id, d.non_striker?.id]
    const id = await choose(
      'New batter',
      playerOptions(squads[batting].filter(p => !outIds.has(p.id) && !inIds.includes(p.id))),
    )
    if (id) await send({ type: 'new_batter', player_id: id })
  }

  async function pickBowler() {
    const id = await choose(
      `Bowler for over ${overNo}`,
      playerOptions(squads[bowling].filter(p => p.id !== d.last_bowler)),
      d.last_bowler ? { note: 'The bowler of the last over is left out.' } : {},
    )
    if (id) await send({ type: 'bowler', player_id: id })
  }

  const ball = (runs: number, extra?: string, wicket?: Record<string, unknown>, fielder?: string | null) =>
    send({
      type: 'ball',
      player2_id: fielder ?? null,
      data: { runs, ...(extra ? { extra } : {}), ...(wicket ? { wicket } : {}) },
    })

  async function extra(kind: 'wide' | 'noball' | 'bye' | 'legbye') {
    const spec = {
      wide: { title: 'Wide: runs run as well?', ns: [0, 1, 2, 3, 4] },
      noball: { title: 'No-ball: runs off the bat?', ns: [0, 1, 2, 3, 4, 6] },
      bye: { title: 'Byes', ns: [1, 2, 3, 4] },
      legbye: { title: 'Leg byes', ns: [1, 2, 3, 4] },
    }[kind]
    const runs = await choose(spec.title, nums(spec.ns))
    if (runs === null || runs === undefined) return
    await ball(runs, kind)
  }

  async function wicket() {
    const kind = await choose('How out?', WICKETS)
    if (!kind) return
    let fielder: string | null = null
    if (kind === 'caught' || kind === 'run_out' || kind === 'stumped') {
      const title = kind === 'caught' ? 'Caught by' : kind === 'stumped' ? 'Stumped by' : 'Run out by'
      const f = await choose(title, playerOptions(squads[bowling]), { skipLabel: 'Not recorded' })
      if (f === undefined) return
      fielder = f
    }
    let who = 'striker'
    let runs = 0
    if (kind === 'run_out') {
      const w = await choose('Who is out?', [
        { label: d.striker?.name ?? 'Striker', value: 'striker', hint: 'on strike' },
        { label: d.non_striker?.name ?? 'Non-striker', value: 'non_striker', hint: 'non-striker' },
      ])
      if (!w) return
      who = w
      const r = await choose('Runs completed before the run-out', nums([0, 1, 2, 3]))
      if (r === null || r === undefined) return
      runs = r
    }
    await ball(runs, undefined, { kind, ...(kind === 'run_out' ? { who } : {}) }, fielder)
  }

  if (board.complete) return <Prompt>The match is decided. End the match below.</Prompt>
  if (!squads[batting].length || !squads[bowling].length) {
    return <Prompt>No squad found for {!squads[batting].length ? teams[batting] : teams[bowling]}. Add players on the Teams page.</Prompt>
  }

  if (d.need_pair) {
    return (
      <div className="space-y-2">
        {d.innings === 1 && <Prompt>Innings break. {teams[batting]} need {d.target} to win.</Prompt>}
        <Pad tone="accent" tall className="w-full" disabled={busy} onClick={openingPair}>
          Choose opening batters for {teams[batting]}
        </Pad>
      </div>
    )
  }
  if (d.need_batter) {
    return <Pad tone="accent" tall className="w-full" disabled={busy} onClick={newBatter}>Choose the new batter</Pad>
  }
  if (d.need_bowler) {
    return <Pad tone="accent" tall className="w-full" disabled={busy} onClick={pickBowler}>Choose the bowler for over {overNo}</Pad>
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate text-center">
        {d.bowler?.name} to {d.striker?.name}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2, 3, 4, 6].map(n => (
          <Pad key={n} tall tone={n === 4 || n === 6 ? 'accent' : 'plain'} disabled={busy} onClick={() => ball(n)}>
            {n === 0 ? '•' : n}
          </Pad>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Pad disabled={busy} onClick={() => extra('wide')}>Wide</Pad>
        <Pad disabled={busy} onClick={() => extra('noball')}>No-ball</Pad>
        <Pad disabled={busy} onClick={() => extra('bye')}>Bye</Pad>
        <Pad disabled={busy} onClick={() => extra('legbye')}>Leg bye</Pad>
      </div>
      <Pad tone="danger" tall className="w-full" disabled={busy} onClick={wicket}>Wicket</Pad>
      <div className="grid grid-cols-2 gap-2">
        <Pad tone="quiet" disabled={busy} onClick={pickBowler}>Change bowler</Pad>
        <Pad tone="quiet" disabled={busy} onClick={() => {
          if (confirm(`Close ${teams[batting]}'s innings now?`)) send({ type: 'innings_end' })
        }}>End innings</Pad>
      </div>
    </div>
  )
}

// ── Football ───────────────────────────────────────────────

const START_LABEL: Record<Period, string> = {
  '1H': 'Kick off', '2H': 'Start 2nd half', ET1: 'Start extra time', ET2: 'Start 2nd half of extra time',
}
const END_LABEL: Record<Period, string> = {
  '1H': 'Half time', '2H': 'Full time', ET1: 'End extra-time 1st half', ET2: 'End extra time',
}

export function FootballConsole({ board, teams, squads, busy, send, choose }: ConsoleProps) {
  const d = board.detail as unknown as FootballDetail
  const started = d.period !== null
  const level = board.totals.a === board.totals.b
  const canShootout = !d.in_play && started && level && !d.shootout && (d.period === '2H' || d.period === 'ET2')
  // The minute is read when the referee first taps, not after the pickers.
  const clockNow = () => clockSeconds(board.clock, Date.now())

  async function goal(side: Side) {
    const at = clockNow()
    const how = await choose(`Goal for ${teams[side]}`, [
      { label: 'Goal', value: 'goal', tone: 'accent' },
      { label: 'Penalty', value: 'pen' },
      { label: 'Own goal', value: 'og', hint: `by a ${teams[other(side)]} player` },
    ])
    if (!how) return
    if (how === 'og') {
      const p = await choose(`Own goal by (${teams[other(side)]})`, playerOptions(squads[other(side)]), { skipLabel: 'Not recorded' })
      if (p === undefined) return
      await send({ type: 'goal', side, player_id: p, data: { own_goal: true, clock_s: at } })
      return
    }
    const scorer = await choose('Scorer', playerOptions(squads[side]), { skipLabel: 'Not recorded' })
    if (scorer === undefined) return
    let assist: string | null = null
    if (how === 'goal' && scorer) {
      const a = await choose('Assist', playerOptions(squads[side].filter(p => p.id !== scorer)), { skipLabel: 'No assist' })
      if (a === undefined) return
      assist = a
    }
    await send({
      type: 'goal', side, player_id: scorer, player2_id: assist,
      data: { clock_s: at, ...(how === 'pen' ? { penalty: true } : {}) },
    })
  }

  async function booking(type: 'yellow' | 'red' | 'foul', side: Side) {
    const at = clockNow()
    const title = type === 'yellow' ? 'Yellow card' : type === 'red' ? 'Red card' : 'Foul by'
    const p = await choose(`${title} (${teams[side]})`, playerOptions(squads[side]), { skipLabel: 'Not recorded' })
    if (p === undefined) return
    await send({ type, side, player_id: p, data: { clock_s: at } })
  }

  async function kick(side: Side, scored: boolean) {
    const p = await choose(`${scored ? 'Scored' : 'Missed'}: ${teams[side]} kicker`, playerOptions(squads[side]), { skipLabel: 'Not recorded' })
    if (p === undefined) return
    await send({ type: 'pen', side, player_id: p, data: { scored } })
  }

  async function addedTime() {
    const m = await choose('Added minutes', nums([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
    if (m) await send({ type: 'added_time', data: { minutes: m } })
  }

  return (
    <div className="space-y-3">
      {!d.in_play && d.next_period && !d.shootout && (
        <Pad tone="accent" tall className="w-full" disabled={busy}
          onClick={() => send({ type: 'period_start', data: { period: d.next_period } })}>
          {START_LABEL[d.next_period]}
        </Pad>
      )}
      {canShootout && (
        <Pad tone="warn" className="w-full" disabled={busy} onClick={() => send({ type: 'shootout_start' })}>
          Go to a penalty shootout
        </Pad>
      )}

      {d.in_play && (
        <div className="grid grid-cols-3 gap-2">
          {board.clock?.running
            ? <Pad disabled={busy} onClick={() => send({ type: 'clock_pause' })}>Pause</Pad>
            : <Pad tone="accent" disabled={busy} onClick={() => send({ type: 'clock_resume' })}>Resume</Pad>}
          <Pad disabled={busy} onClick={addedTime}>+ Added</Pad>
          <Pad tone="warn" disabled={busy} onClick={() => {
            if (confirm(`${END_LABEL[d.period!]}?`)) send({ type: 'period_end' })
          }}>{END_LABEL[d.period!]}</Pad>
        </div>
      )}

      {started && !d.shootout && (
        <div className="grid grid-cols-2 gap-3">
          {SIDES.map(side => (
            <div key={side} className="space-y-2">
              <p className="text-xs font-semibold text-slate text-center truncate">{teams[side]}</p>
              <Pad tone="accent" tall className="w-full" disabled={busy} onClick={() => goal(side)}>Goal</Pad>
              <div className="grid grid-cols-3 gap-1">
                <Pad tone="warn" disabled={busy} onClick={() => booking('yellow', side)} className="text-xs">Yellow</Pad>
                <Pad tone="danger" disabled={busy} onClick={() => booking('red', side)} className="text-xs">Red</Pad>
                <Pad disabled={busy} onClick={() => booking('foul', side)} className="text-xs">Foul</Pad>
              </div>
            </div>
          ))}
        </div>
      )}

      {d.shootout && !d.shootout.decided && (
        <div className="grid grid-cols-2 gap-3">
          {SIDES.map(side => (
            <div key={side} className="space-y-2">
              <p className="text-xs font-semibold text-slate text-center truncate">{teams[side]}</p>
              <Pad tone="accent" className="w-full" disabled={busy} onClick={() => kick(side, true)}>Scored</Pad>
              <Pad className="w-full" disabled={busy} onClick={() => kick(side, false)}>Missed</Pad>
            </div>
          ))}
        </div>
      )}
      {board.complete && <Prompt>The match is decided. End the match below.</Prompt>}
    </div>
  )
}

// ── Basketball ─────────────────────────────────────────────

export function BasketballConsole({ board, teams, squads, busy, send, choose }: ConsoleProps) {
  const d = board.detail as unknown as BasketballDetail
  const [named, setNamed] = useState(true)
  const periodName = d.period <= d.periods
    ? (d.periods === 2 ? `half ${d.period}` : `Q${d.period}`)
    : `OT${d.period - d.periods}`

  async function score(side: Side, value: number) {
    let p: string | null = null
    if (named) {
      const pick = await choose(`+${value} ${teams[side]}`, playerOptions(squads[side]), { skipLabel: 'Not recorded' })
      if (pick === undefined) return
      p = pick
    }
    await send({ type: 'points', side, player_id: p, data: { value } })
  }
  async function foul(side: Side) {
    const p = await choose(`Foul (${teams[side]})`, playerOptions(squads[side]), { skipLabel: 'Not recorded' })
    if (p === undefined) return
    await send({ type: 'foul', side, player_id: p })
  }

  if (board.complete) return <Prompt>The game is decided. End the match below.</Prompt>
  return (
    <div className="space-y-3">
      <NameToggle named={named} setNamed={setNamed} />
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map(side => (
          <div key={side} className="space-y-2">
            <p className="text-xs font-semibold text-slate text-center truncate">{teams[side]}</p>
            <div className="grid grid-cols-3 gap-1">
              {[1, 2, 3].map(v => (
                <Pad key={v} tall tone={v === 3 ? 'accent' : 'plain'} disabled={busy} onClick={() => score(side, v)}>+{v}</Pad>
              ))}
            </div>
            <Pad className="w-full" disabled={busy} onClick={() => foul(side)}>Foul</Pad>
          </div>
        ))}
      </div>
      <Pad tone="warn" className="w-full" disabled={busy} onClick={() => {
        if (confirm(`End ${periodName}?`)) send({ type: 'period_end' })
      }}>End {periodName}</Pad>
    </div>
  )
}

// ── Volleyball and table tennis ────────────────────────────

export function SetsConsole({ board, teams, squads, busy, send, choose }: ConsoleProps) {
  const [named, setNamed] = useState(false)
  async function point(side: Side) {
    let p: string | null = null
    if (named && squads[side].length) {
      const pick = await choose(`Point ${teams[side]}`, playerOptions(squads[side]), { skipLabel: 'Not recorded' })
      if (pick === undefined) return
      p = pick
    }
    await send({ type: 'point', side, player_id: p })
  }
  if (board.complete) return <Prompt>The match is decided. End the match below.</Prompt>
  return (
    <div className="space-y-3">
      {(squads.a.length > 0 || squads.b.length > 0) && <NameToggle named={named} setNamed={setNamed} />}
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map(side => (
          <Pad key={side} tone="accent" className="min-h-32 text-xl" disabled={busy} onClick={() => point(side)}>
            Point<br /><span className="text-sm font-medium">{teams[side]}</span>
          </Pad>
        ))}
      </div>
    </div>
  )
}

// ── Pool ───────────────────────────────────────────────────

export function PoolConsole({ board, teams, squads, busy, send, choose }: ConsoleProps) {
  async function foul(side: Side) {
    const p = squads[side].length
      ? await choose(`Foul (${teams[side]})`, playerOptions(squads[side]), { skipLabel: 'Not recorded' })
      : null
    if (p === undefined) return
    await send({ type: 'foul', side, player_id: p })
  }
  if (board.complete) return <Prompt>The race is won. End the match below.</Prompt>
  return (
    <div className="grid grid-cols-2 gap-3">
      {SIDES.map(side => (
        <div key={side} className="space-y-2">
          <Pad tone="accent" className="w-full min-h-28 text-xl" disabled={busy} onClick={() => send({ type: 'frame', side })}>
            Frame<br /><span className="text-sm font-medium">{teams[side]}</span>
          </Pad>
          <Pad className="w-full" disabled={busy} onClick={() => foul(side)}>Foul</Pad>
        </div>
      ))}
    </div>
  )
}

function NameToggle({ named, setNamed }: { named: boolean; setNamed: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-center gap-2 text-xs text-slate">
      <input type="checkbox" checked={named} onChange={e => setNamed(e.target.checked)} className="accent-amber w-4 h-4" />
      Name the player each time
    </label>
  )
}
