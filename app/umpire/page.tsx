'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { SPORTS, type SportType } from '@/lib/sports'

interface Row {
  id: string; sport: SportType; team_a: string; team_b: string
  match_date: string; venue: string | null; status: string
  scoring: { scorer_name: string | null; ended: boolean; score: { a: string; b: string } | null; status: string | null; result: string | null } | null
}

export default function UmpireHome() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/umpire/matches', { cache: 'no-store' })
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error ?? 'Could not load matches')
        setRows(j.matches as Row[])
      })
      .catch(e => setError(e.message))
  }, [])

  if (error) return <p className="text-crimson-light text-center py-10">{error}</p>
  if (!rows) return <p className="text-slate text-center py-10">Loading…</p>

  const live = rows.filter(r => r.status === 'live')
  const upcoming = rows.filter(r => r.status === 'upcoming')
  const done = rows.filter(r => r.status === 'completed').reverse()

  const section = (title: string, list: Row[], tone: string) => list.length > 0 && (
    <section className="space-y-2">
      <h2 className={`text-sm font-semibold ${tone}`}>{title}</h2>
      {list.map(m => (
        <Link key={m.id} href={`/umpire/${m.id}`}
          className="block bg-table hover:bg-raised border border-rail hover:border-amber/50 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate">{SPORTS[m.sport]?.emoji} {SPORTS[m.sport]?.label} · {format(new Date(m.match_date), 'dd MMM, h:mm a')}</p>
              <p className="font-semibold text-white truncate">{m.team_a} vs {m.team_b}</p>
              {m.scoring && (
                <p className="text-xs text-slate mt-0.5">
                  {m.scoring.ended ? (m.scoring.result ?? 'Ended') : `${m.scoring.status ?? ''}${m.scoring.scorer_name ? ` · scored by ${m.scoring.scorer_name}` : ''}`}
                </p>
              )}
            </div>
            {m.scoring?.score && (
              <p className="text-xl font-bold text-white tabular-nums shrink-0">
                {m.scoring.score.a || '–'} <span className="text-slate">-</span> {m.scoring.score.b || '–'}
              </p>
            )}
          </div>
        </Link>
      ))}
    </section>
  )

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Score a match</h1>
        <p className="text-sm text-slate mt-1">Pick the match you are refereeing. Everyone watching sees your taps live.</p>
      </div>
      {section('Live now', live, 'text-crimson-light')}
      {section('Upcoming', upcoming, 'text-amber')}
      {section('Finished recently', done, 'text-slate')}
      {rows.length === 0 && <p className="text-slate text-center py-10">No matches to score.</p>}
    </div>
  )
}
