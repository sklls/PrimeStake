import { describe, it, expect } from 'vitest'
import { pool } from './pool'
import { recorder, TEAMS, by } from './test-helpers'

const s = pool.settings({ race_to: 3 })

describe('pool', () => {
  it('defaults to a race to three and clamps nonsense', () => {
    expect(pool.settings({}).race_to).toBe(3)
    expect(pool.settings({ race_to: -4 }).race_to).toBe(1)
  })

  it('counts a frame for the side that won it', () => {
    const r = recorder()
    r.add('frame', 'a'); r.add('frame', 'b'); r.add('frame', 'a')
    const b = pool.reduce(s, r.events, TEAMS)
    expect(b.score).toEqual({ a: '2', b: '1' })
    expect(b.complete).toBe(false)
  })

  it('is decided when a side reaches the race target', () => {
    const r = recorder()
    r.add('frame', 'b'); r.add('frame', 'b'); r.add('frame', 'a'); r.add('frame', 'b')
    const b = pool.reduce(s, r.events, TEAMS)
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('b')
    expect(b.result).toBe('Daredevils won 3-1')
  })

  it('ignores frames entered after the race is won', () => {
    const r = recorder()
    for (let i = 0; i < 5; i++) r.add('frame', 'a')
    expect(pool.reduce(s, r.events, TEAMS).score.a).toBe('3')
  })

  it('notes a foul against a player without changing the score', () => {
    const r = recorder()
    r.add('foul', 'a', by('p1'))
    const b = pool.reduce(s, r.events, TEAMS)
    expect(b.players.p1.stats.fouls).toBe(1)
    expect(b.totals).toEqual({ a: 0, b: 0 })
  })

  it('refuses a frame once the race is won', () => {
    const r = recorder()
    for (let i = 0; i < 3; i++) r.add('frame', 'a')
    expect(pool.check(pool.reduce(s, r.events, TEAMS), s, r.add('frame', 'b'))).toMatch(/decided/i)
  })
})
