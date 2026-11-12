import { describe, it, expect } from 'vitest'
import { volleyball, tableTennis, type SetsDetail } from './sets'
import { recorder, TEAMS, by } from './test-helpers'
import type { Side } from './types'

const tt = tableTennis.settings({ best_of: 3 })
const detail = (b: { detail: unknown }) => b.detail as SetsDetail

function points(r: ReturnType<typeof recorder>, side: Side, n: number) {
  for (let i = 0; i < n; i++) r.add('point', side)
}

describe('set sports', () => {
  it('defaults table tennis to 11 and volleyball to 25 with a 15-point decider', () => {
    expect(tableTennis.settings({})).toMatchObject({ points: 11, decider_points: null })
    expect(volleyball.settings({})).toMatchObject({ points: 25, decider_points: 15 })
  })

  it('adds a point to the current set', () => {
    const r = recorder()
    points(r, 'a', 3); points(r, 'b', 1)
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(detail(b).current).toEqual({ a: 3, b: 1 })
    expect(b.score).toEqual({ a: '0', b: '0' })
  })

  it('closes a set at the target when the lead is two', () => {
    const r = recorder()
    points(r, 'b', 5); points(r, 'a', 11)
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(detail(b).sets).toEqual([{ a: 11, b: 5, winner: 'a' }])
    expect(detail(b).current).toEqual({ a: 0, b: 0 })
    expect(b.score).toEqual({ a: '1', b: '0' })
  })

  it('plays on past the target until someone leads by two', () => {
    const r = recorder()
    points(r, 'a', 10); points(r, 'b', 10)
    points(r, 'a', 1)
    expect(detail(tableTennis.reduce(tt, r.events, TEAMS)).sets).toEqual([])
    points(r, 'a', 1)
    expect(detail(tableTennis.reduce(tt, r.events, TEAMS)).sets).toEqual([{ a: 12, b: 10, winner: 'a' }])
  })

  it('decides the match when a side has the majority of sets', () => {
    const r = recorder()
    points(r, 'a', 11); points(r, 'a', 11)
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('a')
    expect(b.result).toBe('Titans won 2-0')
  })

  it('ignores points entered after the match is decided', () => {
    const r = recorder()
    points(r, 'a', 22); points(r, 'b', 4)
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(b.score).toEqual({ a: '2', b: '0' })
    expect(b.totals).toEqual({ a: 22, b: 0 })
  })

  it("plays volleyball's deciding set to the shorter target", () => {
    const vb = volleyball.settings({ best_of: 3 })
    const r = recorder()
    points(r, 'a', 25); points(r, 'b', 25)   // one set each
    points(r, 'a', 15)
    const b = volleyball.reduce(vb, r.events, TEAMS)
    expect(b.complete).toBe(true)
    expect(detail(b).sets[2]).toEqual({ a: 15, b: 0, winner: 'a' })
  })

  it('counts points against a named player', () => {
    const r = recorder()
    r.add('point', 'a', by('p1')); r.add('point', 'a', by('p1')); r.add('point', 'a')
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(b.players.p1.stats.points).toBe(2)
  })

  it('stays live until the referee ends the match, then is finished', () => {
    const r = recorder()
    points(r, 'a', 22)
    expect(tableTennis.reduce(tt, r.events, TEAMS).phase).toBe('live')
    r.add('end_match')
    expect(tableTennis.reduce(tt, r.events, TEAMS).phase).toBe('finished')
  })

  it('refuses a new point once the match is decided', () => {
    const r = recorder()
    points(r, 'a', 22)
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(tableTennis.check(b, tt, r.add('point', 'b'))).toMatch(/decided/i)
  })

  it('allows a point while the match is undecided', () => {
    const r = recorder()
    const b = tableTennis.reduce(tt, r.events, TEAMS)
    expect(tableTennis.check(b, tt, r.add('point', 'b'))).toBeNull()
  })
})
