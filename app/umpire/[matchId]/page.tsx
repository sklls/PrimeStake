'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TapQueue } from '@/lib/tap-queue'
import Link from 'next/link'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase'
import { SPORTS, type SportType } from '@/lib/sports'
import type { Scoreboard, Teams } from '@/lib/scoring/types'
import ScoreboardView from '@/components/live/ScoreboardView'
import SettingsForm from '@/components/umpire/SettingsForm'
import { useSheet, type ConsoleProps, type Draft, type Option, type Squads } from '@/components/umpire/kit'
import {
  BasketballConsole, CricketConsole, FootballConsole, PoolConsole, SetsConsole,
} from '@/components/umpire/consoles'

interface EventRow {
  seq: number; type: string; side: 'a' | 'b' | null
  player_id: string | null; player_name: string | null
  player2_id: string | null; player2_name: string | null
  data: Record<string, unknown>; created_at: string
  voided_at: string | null; edited_at: string | null
}
interface ScoreRow {
  settings: Record<string, unknown>; state: Scoreboard; version: number
  scorer_id: string | null; scorer_name: string | null
  started_at: string | null; ended_at: string | null
}
interface Payload {
  match: { id: string; sport: SportType; format: string; team_a: string; team_b: string; match_date: string; venue: string | null; status: string }
  score: ScoreRow | null
  events: EventRow[]
  squads: Squads
  me: { id: string; role: 'umpire' | 'admin' }
}

const CONSOLES: Record<SportType, (p: ConsoleProps) => JSX.Element> = {
  cricket: CricketConsole, football: FootballConsole, basketball: BasketballConsole,
  volleyball: SetsConsole, table_tennis: SetsConsole, pool: PoolConsole,
}

function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    setOnline(navigator.onLine)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

export default function UmpireMatchPage({ params }: { params: { matchId: string } }) {
  const id = params.matchId
  const [data, setData] = useState<Payload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [pending, setPending] = useState(0)
  const [dropNotice, setDropNotice] = useState('')
  const online = useOnline()
  const { sheet, choose } = useSheet()

  // The version every write must name. Kept in a ref, not read from state:
  // queued taps go out back to back, faster than React re-renders, and each
  // must carry the version the previous one produced.
  const versionRef = useRef(0)

  const load = useCallback(async () => {
    const res = await fetch(`/api/umpire/${id}`, { cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setLoadError(j.error ?? 'Could not load this match'); return }
    versionRef.current = (j as Payload).score?.version ?? 0
    setData(j as Payload)
  }, [id])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/umpire/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, version: versionRef.current }),
      })
      const j = await res.json().catch(() => ({}))
      if ('score' in j || 'events' in j) {
        if (typeof j.score?.version === 'number') versionRef.current = j.score.version
        setData(prev => prev ? { ...prev, score: j.score ?? prev.score, events: j.events ?? prev.events } : prev)
      }
      if (!res.ok) { setError(j.error ?? 'Something went wrong'); return false }
      return true
    } catch {
      setError('No connection. That tap was not saved — try again.')
      return false
    } finally {
      setBusy(false)
    }
  }, [id])

  // Taps queue instead of being lost while a save is in flight.
  const actRef = useRef(act)
  actRef.current = act
  const queueRef = useRef<TapQueue<Draft> | null>(null)
  if (!queueRef.current) {
    queueRef.current = new TapQueue<Draft>({
      run: draft => actRef.current({
        action: 'event',
        event: { side: null, player_id: null, player2_id: null, data: {}, ...draft },
      }),
      onChange: setPending,
      onDrop: n => setDropNotice(
        `The ${n === 1 ? 'tap' : `${n} taps`} made after it ${n === 1 ? 'was' : 'were'} not saved. Enter ${n === 1 ? 'it' : 'them'} again if ${n === 1 ? 'it' : 'they'} happened.`,
      ),
    })
  }
  const send = async (draft: Draft) => {
    setDropNotice('')
    queueRef.current!.push(draft)
    return true
  }

  // Follow the score row so a take-over or a second device is noticed at once.
  // Our own queued writes also arrive here; those are skipped while the queue runs.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`umpire-${id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'match_scores', filter: `match_id=eq.${id}` },
        payload => {
          if (queueRef.current?.running) return
          const v = (payload.new as { version?: number } | null)?.version ?? 0
          if (v > versionRef.current) load()
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, load])

  const teams: Teams = useMemo(
    () => ({ a: data?.match.team_a ?? '', b: data?.match.team_b ?? '' }),
    [data?.match.team_a, data?.match.team_b],
  )

  if (loadError) return <p className="text-crimson-light text-center py-10">{loadError}</p>
  if (!data) return <p className="text-slate text-center py-10">Loading…</p>

  const { match, score, me, squads, events } = data
  const sport = match.sport
  const board = score?.state
  const ended = Boolean(score?.ended_at)
  const mine = Boolean(score) && score!.scorer_id === me.id && !ended
  const canCorrect = mine || (ended && me.role === 'admin')
  const Console = CONSOLES[sport]
  const liveRows = events.filter(e => !e.voided_at && e.type !== 'end_match')
  const lastLive = liveRows[liveRows.length - 1]

  async function correct(seq: number) {
    const row = events.find(e => e.seq === seq)
    if (!row) return
    const options: Option<string>[] = [{ label: 'Remove this entry', value: 'void', tone: 'danger' }]
    if (row.player_id || row.player_name !== null || ['goal', 'yellow', 'red', 'foul', 'points', 'point', 'frame', 'pen', 'new_batter', 'bowler', 'batters'].includes(row.type)) {
      options.push({ label: 'Change player', value: 'p1' })
    }
    if (row.player2_id || ['goal', 'ball', 'batters'].includes(row.type)) {
      options.push({ label: row.type === 'goal' ? 'Change assist' : row.type === 'ball' ? 'Change fielder' : 'Change second player', value: 'p2' })
    }
    const what = await choose('Correct this entry', options, { note: 'It keeps its place in the record.' })
    if (!what) return
    if (what === 'void') {
      if (confirm('Remove this entry? The score will be recalculated.')) await act({ action: 'void', seq })
      return
    }
    const everyone: Option<string>[] = [
      ...squads.a.map(p => ({ label: p.name, value: p.id, hint: teams.a })),
      ...squads.b.map(p => ({ label: p.name, value: p.id, hint: teams.b })),
    ]
    const pick = await choose(what === 'p1' ? 'Correct player' : 'Correct second player', everyone, { skipLabel: 'No player' })
    if (pick === undefined) return
    await act({
      action: 'edit', seq,
      player_id: what === 'p1' ? pick : row.player_id,
      player2_id: what === 'p2' ? pick : row.player2_id,
    })
  }

  // Each entry once, newest first, using its first line of feed text.
  const recent: { seq: number; text: string; tag: string | null }[] = []
  if (board) {
    const seen = new Set<number>()
    for (const line of board.feed) {
      if (seen.has(line.seq)) continue
      const row = events.find(e => e.seq === line.seq)
      if (!row || row.voided_at || row.type === 'end_match') continue
      seen.add(line.seq)
      recent.push({ seq: line.seq, text: line.text, tag: line.tag })
      if (recent.length >= 12) break
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-24">
      {sheet}

      <div>
        <Link href="/umpire" className="text-sm text-slate hover:text-white">← All matches</Link>
        <p className="text-xs text-slate mt-2">{SPORTS[sport]?.emoji} {SPORTS[sport]?.label} · {format(new Date(match.match_date), 'dd MMM, h:mm a')}{match.venue ? ` · ${match.venue}` : ''}</p>
        <h1 className="text-xl font-bold text-white">{match.team_a} vs {match.team_b}</h1>
      </div>

      {!online && (
        <p className="rounded-lg px-3 py-2 text-sm bg-crimson/20 border border-crimson/40 text-crimson-light">
          No connection. Taps will not be saved until you are back online.
        </p>
      )}
      {error && (
        <p className="rounded-lg px-3 py-2 text-sm bg-crimson/10 border border-crimson/30 text-crimson-light">{error}</p>
      )}

      {!score && (
        <div className="bg-table border border-rail rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-white">Set up the match</h2>
          {match.status === 'completed' || match.status === 'cancelled' ? (
            <p className="text-sm text-slate">This match is {match.status}.</p>
          ) : (
            <SettingsForm
              sport={sport} teams={teams} busy={busy} submitLabel="Start match"
              onSubmit={settings => act({ action: 'start', settings })}
            />
          )}
          <p className="text-xs text-slate">Starting marks the match live for everyone and locks its fantasy contest.</p>
        </div>
      )}

      {board && <ScoreboardView board={board} teams={teams} showFeed={false} />}

      {score && ended && (
        <div className="bg-table border border-rail rounded-xl p-4 space-y-2 text-sm">
          <p className="text-white font-semibold">Final whistle{score.ended_at ? ` at ${format(new Date(score.ended_at), 'h:mm a')}` : ''}.</p>
          <p className="text-slate">Betting is closed. The admin settles each market from the matches page.</p>
          {me.role === 'admin' && (
            <button
              disabled={busy}
              onClick={() => { if (confirm('Reopen this match? It goes back to live.')) act({ action: 'reopen' }) }}
              className="min-h-12 px-4 rounded-xl bg-raised text-white font-semibold"
            >Reopen match</button>
          )}
        </div>
      )}

      {score && !ended && !mine && (
        <div className="bg-table border border-gold/40 rounded-xl p-4 space-y-3">
          <p className="text-sm text-white">{score.scorer_name ?? 'Someone else'} is scoring this match.</p>
          <button
            disabled={busy}
            onClick={() => { if (confirm(`Take over from ${score.scorer_name ?? 'the current scorer'}? Their screen will stop accepting taps.`)) act({ action: 'takeover' }) }}
            className="w-full min-h-14 rounded-xl bg-gold text-baize font-bold"
          >Take over scoring</button>
        </div>
      )}

      {mine && board && (
        <>
          <div className="bg-table border border-rail rounded-xl p-3">
            {/* Not disabled while saving: taps queue and go out in order. */}
            <Console
              board={board} settings={score!.settings} teams={teams} squads={squads}
              busy={!online} send={send} choose={choose}
            />
            {pending > 0 && (
              <p className="text-xs text-slate text-center mt-2">
                Saving {pending} tap{pending === 1 ? '' : 's'}…
              </p>
            )}
            {dropNotice && <p className="text-xs text-gold text-center mt-2">{dropNotice}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={busy || pending > 0 || !lastLive}
              onClick={() => lastLive && act({ action: 'void', seq: lastLive.seq })}
              className="min-h-14 rounded-xl bg-raised text-white font-semibold disabled:opacity-40"
            >↶ Undo last</button>
            <button
              disabled={busy || pending > 0}
              onClick={() => {
                const r = board.result ? `\n\n${board.result}` : '\n\nNo result has been reached yet.'
                if (confirm(`Blow the final whistle? Betting on this match closes.${r}`)) act({ action: 'end' })
              }}
              className="min-h-14 rounded-xl bg-crimson text-white font-semibold"
            >End match</button>
          </div>

          <button onClick={() => setShowSettings(s => !s)} className="text-xs text-slate underline">
            {showSettings ? 'Hide match settings' : 'Match settings'}
          </button>
          {showSettings && (
            <div className="bg-table border border-rail rounded-xl p-4">
              <SettingsForm
                sport={sport} teams={teams} busy={busy} initial={score!.settings} submitLabel="Save settings"
                onSubmit={async s => { if (await act({ action: 'settings', settings: s })) setShowSettings(false) }}
              />
            </div>
          )}
        </>
      )}

      {board && recent.length > 0 && (
        <div className="bg-table border border-rail rounded-xl overflow-hidden">
          <p className="px-4 py-2 text-xs font-semibold text-slate border-b border-rail">
            {canCorrect ? 'Recent entries · tap one to correct it' : 'Recent entries'}
          </p>
          <ul className="divide-y divide-rail/50">
            {recent.map(r => (
              <li key={r.seq}>
                <button
                  disabled={!canCorrect || busy || pending > 0}
                  onClick={() => correct(r.seq)}
                  className="w-full text-left px-4 py-3 flex gap-3 text-sm disabled:cursor-default"
                >
                  <span className="w-12 shrink-0 text-xs text-slate tabular-nums pt-0.5">{r.tag ?? ''}</span>
                  <span className="flex-1 text-white">{r.text}</span>
                  {canCorrect && <span className="text-slate text-xs pt-0.5">Edit</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
