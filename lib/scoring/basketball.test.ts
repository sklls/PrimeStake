import { describe, it, expect } from 'vitest'
import { basketball, type BasketballDetail } from './basketball'
import { recorder, TEAMS, by } from './test-helpers'

const s = basketball.settings({})
const detail = (b: { detail: unknown }) => b.detail as BasketballDetail
const pts = (value: number) => ({ data: { value } })

describe('basketball', () => {
  it('defaults to four periods', () => {
    expect(s.periods).toBe(4)
  })

  it('adds one, two or three points to the side and the player', () => {
    const r = recorder()
    r.add('points', 'a', { ...by('p1'), ...pts(3) })
    r.add('points', 'a', { ...by('p1'), ...pts(2) })
    r.add('points', 'b', { ...by('p2'), ...pts(1) })
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(b.totals).toEqual({ a: 5, b: 1 })
    expect(b.players.p1.stats.points).toBe(5)
  })

  it('treats a value outside 1-3 as nothing scored', () => {
    const r = recorder()
    r.add('points', 'a', pts(7))
    expect(basketball.reduce(s, r.events, TEAMS).totals.a).toBe(0)
  })

  it('counts fouls for the player and for the team in this period only', () => {
    const r = recorder()
    r.add('foul', 'a', by('p1')); r.add('foul', 'a', by('p1'))
    r.add('period_end')
    r.add('foul', 'a', by('p1'))
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(b.players.p1.stats.fouls).toBe(3)
    expect(detail(b).team_fouls).toEqual({ a: 1, b: 0 })
  })

  it('moves to the next period and keeps each period score', () => {
    const r = recorder()
    r.add('points', 'a', pts(2)); r.add('period_end'); r.add('points', 'b', pts(3))
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(detail(b).period).toBe(2)
    expect(detail(b).by_period).toEqual([{ a: 2, b: 0 }, { a: 0, b: 3 }])
    expect(b.status).toBe('Q2')
  })

  it('is decided after the last period when one side leads', () => {
    const r = recorder()
    r.add('points', 'a', pts(2))
    for (let i = 0; i < 4; i++) r.add('period_end')
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('a')
    expect(b.result).toBe('Titans won 2-0')
  })

  it('goes to overtime instead when level after the last period', () => {
    const r = recorder()
    for (let i = 0; i < 4; i++) r.add('period_end')
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(b.complete).toBe(false)
    expect(b.status).toBe('OT1')
  })

  it('is decided by the end of an overtime period that breaks the tie', () => {
    const r = recorder()
    for (let i = 0; i < 4; i++) r.add('period_end')
    r.add('points', 'b', pts(2)); r.add('period_end')
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('b')
  })

  it('refuses points once the game is decided', () => {
    const r = recorder()
    r.add('points', 'a', pts(2))
    for (let i = 0; i < 4; i++) r.add('period_end')
    const b = basketball.reduce(s, r.events, TEAMS)
    expect(basketball.check(b, s, r.add('points', 'b', pts(2)))).toMatch(/decided/i)
  })
})
