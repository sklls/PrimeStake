'use client'

import { useState } from 'react'
import type { SportType } from '@/lib/sports'
import type { Teams } from '@/lib/scoring/types'

type Field =
  | { key: string; label: string; kind: 'number'; min: number; max: number; def: number }
  | { key: string; label: string; kind: 'choice'; options: { label: string; value: string | number }[]; def: string | number }

function fieldsFor(sport: SportType, teams: Teams): Field[] {
  switch (sport) {
    case 'cricket': return [
      { key: 'overs', label: 'Overs per innings', kind: 'number', min: 1, max: 50, def: 10 },
      { key: 'wickets', label: 'Wickets per innings', kind: 'number', min: 1, max: 10, def: 10 },
      { key: 'bat_first', label: 'Batting first', kind: 'choice', def: 'a',
        options: [{ label: teams.a, value: 'a' }, { label: teams.b, value: 'b' }] },
    ]
    case 'football': return [
      { key: 'half_minutes', label: 'Minutes per half', kind: 'number', min: 1, max: 60, def: 45 },
      { key: 'et_minutes', label: 'Minutes per extra-time half', kind: 'number', min: 1, max: 30, def: 15 },
    ]
    case 'basketball': return [
      { key: 'periods', label: 'Periods', kind: 'choice', def: 4,
        options: [{ label: '4 quarters', value: 4 }, { label: '2 halves', value: 2 }] },
    ]
    case 'volleyball': return [
      { key: 'best_of', label: 'Best of', kind: 'choice', def: 3, options: [3, 5].map(n => ({ label: `${n} sets`, value: n })) },
      { key: 'points', label: 'Points per set', kind: 'number', min: 5, max: 50, def: 25 },
      { key: 'decider_points', label: 'Points in the deciding set', kind: 'number', min: 5, max: 50, def: 15 },
    ]
    case 'table_tennis': return [
      { key: 'best_of', label: 'Best of', kind: 'choice', def: 3, options: [3, 5, 7].map(n => ({ label: `${n} games`, value: n })) },
      { key: 'points', label: 'Points per game', kind: 'number', min: 5, max: 50, def: 11 },
    ]
    case 'pool': return [
      { key: 'race_to', label: 'Race to (frames)', kind: 'number', min: 1, max: 15, def: 3 },
    ]
  }
}

export default function SettingsForm({
  sport, teams, initial, submitLabel, busy, onSubmit,
}: {
  sport: SportType
  teams: Teams
  initial?: Record<string, unknown>
  submitLabel: string
  busy: boolean
  onSubmit: (settings: Record<string, unknown>) => void
}) {
  const fields = fieldsFor(sport, teams)
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map(f => [f.key, initial?.[f.key] ?? f.def])),
  )
  const set = (k: string, v: unknown) => setValues(prev => ({ ...prev, [k]: v }))

  return (
    <div className="space-y-4">
      {fields.map(f => (
        <div key={f.key} className="space-y-1.5">
          <p className="text-sm text-slate">{f.label}</p>
          {f.kind === 'number' ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => set(f.key, Math.max(f.min, Number(values[f.key]) - 1))}
                className="w-14 h-14 rounded-xl bg-raised text-white text-2xl">−</button>
              <span className="flex-1 text-center text-2xl font-bold text-white tabular-nums">{String(values[f.key])}</span>
              <button type="button" onClick={() => set(f.key, Math.min(f.max, Number(values[f.key]) + 1))}
                className="w-14 h-14 rounded-xl bg-raised text-white text-2xl">+</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {f.options.map(o => (
                <button key={String(o.value)} type="button" onClick={() => set(f.key, o.value)}
                  className={`min-h-14 rounded-xl font-semibold px-2 ${
                    values[f.key] === o.value ? 'bg-amber text-white' : 'bg-raised text-slate'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        onClick={() => onSubmit(values)}
        disabled={busy}
        className="w-full min-h-16 rounded-xl bg-amber hover:bg-amber-deep disabled:opacity-50 text-white text-lg font-bold"
      >
        {busy ? 'Please wait…' : submitLabel}
      </button>
    </div>
  )
}
