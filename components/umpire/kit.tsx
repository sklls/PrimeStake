'use client'

// Building blocks for the scoring console, which is used one-handed on a phone
// at the side of a pitch: every choice is a big button, nothing is typed.

import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Scoreboard, Side, Teams } from '@/lib/scoring/types'

export interface SquadPlayer { id: string; name: string; role: string | null }
export type Squads = Record<Side, SquadPlayer[]>

export interface Draft {
  type: string
  side?: Side | null
  player_id?: string | null
  player2_id?: string | null
  data?: Record<string, unknown>
}

export interface Option<T> { label: string; value: T; hint?: string; tone?: Tone }

/** Resolves to the chosen value, null when the "skip" button is used, or undefined when cancelled. */
export type Choose = <T>(
  title: string,
  options: Option<T>[],
  extra?: { skipLabel?: string; note?: string },
) => Promise<T | null | undefined>

export interface ConsoleProps {
  board: Scoreboard
  settings: Record<string, unknown>
  teams: Teams
  squads: Squads
  busy: boolean
  send: (draft: Draft) => Promise<boolean>
  choose: Choose
}

export const playerOptions = (players: SquadPlayer[]): Option<string>[] =>
  players.map(p => ({ label: p.name, value: p.id, hint: p.role ?? undefined }))

interface Spec { title: string; options: Option<unknown>[]; skipLabel?: string; note?: string }

export function useSheet() {
  const [spec, setSpec] = useState<Spec | null>(null)
  const resolver = useRef<((v: unknown) => void) | null>(null)

  const close = (v: unknown) => {
    resolver.current?.(v)
    resolver.current = null
    setSpec(null)
  }

  const choose = useCallback(<T,>(
    title: string,
    options: Option<T>[],
    extra: { skipLabel?: string; note?: string } = {},
  ) => new Promise<T | null | undefined>(resolve => {
    resolver.current = resolve as (v: unknown) => void
    setSpec({ title, options: options as Option<unknown>[], ...extra })
  }), []) as Choose

  const sheet: ReactNode = spec ? (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center"
      onClick={() => close(undefined)}
    >
      <div
        className="w-full sm:max-w-md bg-table border-t sm:border border-rail rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-white mb-1">{spec.title}</h3>
        {spec.note && <p className="text-xs text-slate mb-3">{spec.note}</p>}
        {spec.options.length === 0 && (
          <p className="text-sm text-gold my-3">Nobody to choose from. Add the squad on the Teams page.</p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-2">
          {spec.options.map((o, i) => (
            <button
              key={i}
              onClick={() => close(o.value)}
              className={`min-h-14 px-3 py-2 rounded-xl text-left font-semibold ${TONE[o.tone ?? 'plain']}`}
            >
              <span className="block leading-tight">{o.label}</span>
              {o.hint && <span className="block text-xs font-normal opacity-70 mt-0.5">{o.hint}</span>}
            </button>
          ))}
        </div>
        {spec.skipLabel && (
          <button
            onClick={() => close(null)}
            className="w-full mt-3 min-h-12 rounded-xl bg-raised text-slate font-medium"
          >
            {spec.skipLabel}
          </button>
        )}
        <button onClick={() => close(undefined)} className="w-full mt-2 min-h-12 rounded-xl text-slate">
          Cancel
        </button>
      </div>
    </div>
  ) : null

  return { sheet, choose }
}

export type Tone = 'plain' | 'accent' | 'danger' | 'warn' | 'quiet'
const TONE: Record<Tone, string> = {
  plain: 'bg-raised hover:bg-rail text-white',
  accent: 'bg-amber hover:bg-amber-deep text-white',
  danger: 'bg-crimson hover:bg-crimson/80 text-white',
  warn: 'bg-gold/90 hover:bg-gold text-baize',
  quiet: 'bg-baize border border-rail text-slate hover:text-white',
}

/** A big tap target. */
export function Pad({
  children, onClick, tone = 'plain', disabled, className = '', tall,
}: {
  children: ReactNode
  onClick: () => void
  tone?: Tone
  disabled?: boolean
  className?: string
  tall?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${tall ? 'min-h-20 text-2xl' : 'min-h-14 text-base'} px-2 rounded-xl font-bold select-none
        active:scale-[0.97] transition-transform disabled:opacity-40 disabled:active:scale-100
        ${TONE[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Prompt({ children }: { children: ReactNode }) {
  return <p className="text-sm text-gold text-center">{children}</p>
}
