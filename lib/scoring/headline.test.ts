import { describe, it, expect } from 'vitest'
import { headline } from './headline'
import { tableTennis, volleyball } from './sets'
import { cricket } from './cricket'
import { recorder, TEAMS, by, and } from './test-helpers'
import type { Side } from './types'

const tt = tableTennis.settings({ best_of: 3 })
const points = (r: ReturnType<typeof recorder>, side: Side, n: number) => { for (let i = 0; i < n; i++) r.add('point', side) }

describe('headline', () => {
  it('shows the points in the set being played as the big number', () => {
    const r = recorder()
    points(r, 'a', 11); points(r, 'b', 3); points(r, 'a', 5) // a won set 1, now 5-3 in set 2
    const h = headline(tableTennis.reduce(tt, r.events, TEAMS))
    expect(h.big).toEqual({ a: '5', b: '3' })
  })

  it('shows sets won underneath while a set is being played', () => {
    const r = recorder()
    points(r, 'a', 11); points(r, 'b', 3)
    const h = headline(tableTennis.reduce(tt, r.events, TEAMS))
    expect(h.small).toEqual({ a: '1 set', b: '0 sets' })
  })

  it('goes back to sets won once the match is decided', () => {
    const r = recorder()
    points(r, 'a', 22)
    const h = headline(tableTennis.reduce(tt, r.events, TEAMS))
    expect(h.big).toEqual({ a: '2', b: '0' })
    expect(h.small).toEqual({ a: 'sets', b: 'sets' })
  })

  it('does the same for volleyball', () => {
    const r = recorder()
    points(r, 'b', 7)
    const h = headline(volleyball.reduce(volleyball.settings({}), r.events, TEAMS))
    expect(h.big).toEqual({ a: '0', b: '7' })
  })

  it('leaves other sports as they were', () => {
    const r = recorder()
    r.add('batters', null, { ...by('s1'), ...and('s2') })
    r.add('bowler', null, by('b1'))
    r.add('ball', null, { data: { runs: 4 } })
    const board = cricket.reduce(cricket.settings({ overs: 2 }), r.events, TEAMS)
    const h = headline(board)
    expect(h.big).toEqual(board.score)
    expect(h.small).toEqual(board.sub)
  })
})
