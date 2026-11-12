// Test-only helpers for building a record of entries.
import type { ScoreEvent, Side, Teams } from './types'

export const TEAMS: Teams = { a: 'Titans', b: 'Daredevils' }

export function recorder() {
  let seq = 0
  const events: ScoreEvent[] = []
  const add = (
    type: string,
    side: Side | null = null,
    extra: Partial<ScoreEvent> = {},
  ): ScoreEvent => {
    const e: ScoreEvent = {
      seq: ++seq,
      type,
      side,
      player_id: null,
      player_name: null,
      player2_id: null,
      player2_name: null,
      data: {},
      created_at: '2026-01-01T10:00:00.000Z',
      ...extra,
    }
    events.push(e)
    return e
  }
  return { events, add }
}

/** A player reference as it appears on an event. */
export const by = (id: string) => ({ player_id: id, player_name: id.toUpperCase() })
export const and = (id: string) => ({ player2_id: id, player2_name: id.toUpperCase() })
