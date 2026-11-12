// ── One entry point for every sport ────────────────────────
import type { SportType } from '@/lib/sports'
import type { Scoreboard, ScoreEvent, SportModule, Teams } from './types'
import { cricket } from './cricket'
import { football } from './football'
import { basketball } from './basketball'
import { volleyball, tableTennis } from './sets'
import { pool } from './pool'

export const MODULES: Record<SportType, SportModule<unknown>> = {
  cricket, football, basketball, volleyball, table_tennis: tableTennis, pool,
}

export function normaliseSettings(sport: SportType, raw: unknown): unknown {
  return MODULES[sport].settings(raw)
}

export function computeBoard(sport: SportType, rawSettings: unknown, events: ScoreEvent[], teams: Teams): Scoreboard {
  const m = MODULES[sport]
  return m.reduce(m.settings(rawSettings), events, teams)
}

export function checkEntry(sport: SportType, rawSettings: unknown, board: Scoreboard, event: ScoreEvent): string | null {
  const m = MODULES[sport]
  return m.check(board, m.settings(rawSettings), event)
}

/** Entries that need the match clock stamped on them when they are made. */
export const CLOCKED = new Set(['goal', 'yellow', 'red', 'foul'])
/** Entries that move the football clock and need the server's time on them. */
export const TIMED = new Set(['period_start', 'period_end', 'clock_pause', 'clock_resume'])

export type { Scoreboard, ScoreEvent, Teams } from './types'
