import { describe, it, expect } from 'vitest'
import { cricket, type CricketDetail } from './cricket'
import { recorder, TEAMS, by, and } from './test-helpers'

type Rec = ReturnType<typeof recorder>
const s = cricket.settings({ overs: 2, wickets: 10, bat_first: 'a' })
const detail = (b: { detail: unknown }) => b.detail as CricketDetail
const board = (r: Rec, settings = s) => cricket.reduce(settings, r.events, TEAMS)

/** Titans open with s1 on strike and s2 at the other end; b1 bowls. */
function open(r: Rec) {
  r.add('batters', null, { ...by('s1'), ...and('s2') })
  r.add('bowler', null, by('b1'))
}
const ball = (r: Rec, runs: number, data: Record<string, unknown> = {}, fielder?: string) =>
  r.add('ball', null, { data: { runs, ...data }, ...(fielder ? and(fielder) : {}) })

/** Daredevils begin their reply with c1 and c2; t1 bowls. */
function reply(r: Rec) {
  r.add('batters', null, { ...by('c1'), ...and('c2') })
  r.add('bowler', null, by('t1'))
}
/** Bowl out an over of dot balls, choosing a new bowler first if needed. */
function dots(r: Rec, n: number) {
  for (let i = 0; i < n; i++) ball(r, 0)
}

describe('cricket settings', () => {
  it('defaults to ten wickets and the first side batting', () => {
    expect(cricket.settings({})).toMatchObject({ wickets: 10, bat_first: 'a' })
  })
})

describe('cricket balls', () => {
  it('adds runs off the bat to the team, the batter and the bowler', () => {
    const r = recorder(); open(r); ball(r, 2)
    const b = board(r)
    expect(b.totals.a).toBe(2)
    expect(b.players.s1.stats).toMatchObject({ runs: 2, balls: 1 })
    expect(b.players.b1.stats).toMatchObject({ bowl_runs: 2, bowl_balls: 1 })
  })

  it('swaps the strike on an odd number of runs', () => {
    const r = recorder(); open(r); ball(r, 1)
    expect(detail(board(r)).striker?.id).toBe('s2')
  })

  it('keeps the strike on a boundary and counts fours and sixes', () => {
    const r = recorder(); open(r); ball(r, 4); ball(r, 6)
    const b = board(r)
    expect(detail(b).striker?.id).toBe('s1')
    expect(b.players.s1.stats).toMatchObject({ runs: 10, fours: 1, sixes: 1 })
  })

  it('scores a wide as an extra that is not a ball faced or a legal delivery', () => {
    const r = recorder(); open(r); ball(r, 0, { extra: 'wide' })
    const b = board(r)
    expect(b.totals.a).toBe(1)
    expect(b.players.s1.stats.balls ?? 0).toBe(0)
    expect(b.players.b1.stats).toMatchObject({ bowl_runs: 1, bowl_balls: 0 })
    expect(b.sub.a).toBe('(0.0 ov)')
  })

  it('adds runs taken off a wide on top of the penalty', () => {
    const r = recorder(); open(r); ball(r, 2, { extra: 'wide' })
    expect(board(r).totals.a).toBe(3)
  })

  it('scores a no-ball as one extra plus whatever came off the bat', () => {
    const r = recorder(); open(r); ball(r, 4, { extra: 'noball' })
    const b = board(r)
    expect(b.totals.a).toBe(5)
    expect(b.players.s1.stats.runs).toBe(4)
    expect(b.players.b1.stats).toMatchObject({ bowl_runs: 5, bowl_balls: 0 })
  })

  it('gives byes to the team but not to the batter or against the bowler', () => {
    const r = recorder(); open(r); ball(r, 2, { extra: 'bye' })
    const b = board(r)
    expect(b.totals.a).toBe(2)
    expect(b.players.s1.stats).toMatchObject({ runs: 0, balls: 1 })
    expect(b.players.b1.stats).toMatchObject({ bowl_runs: 0, bowl_balls: 1 })
  })

  it('ends the over after six legal balls, swaps the strike and asks for a bowler', () => {
    const r = recorder(); open(r)
    ball(r, 0, { extra: 'wide' })   // does not count towards the six
    dots(r, 6)
    const b = board(r)
    expect(b.sub.a).toBe('(1.0 ov)')
    expect(detail(b).striker?.id).toBe('s2')
    expect(detail(b).bowler).toBeNull()
    expect(detail(b).need_bowler).toBe(true)
  })

  it('tags each ball in the feed with its over and ball number', () => {
    const r = recorder(); open(r); ball(r, 0); ball(r, 1)
    expect(board(r).feed[0].tag).toBe('0.2')
  })
})

describe('cricket wickets', () => {
  it('takes a wicket for the bowler and leaves the striker\'s end empty', () => {
    const r = recorder(); open(r); ball(r, 0, { wicket: { kind: 'bowled' } })
    const b = board(r)
    expect(b.score.a).toBe('0/1')
    expect(b.players.b1.stats.wickets).toBe(1)
    expect(detail(b).striker).toBeNull()
    expect(detail(b).need_batter).toBe(true)
  })

  it('credits the catcher', () => {
    const r = recorder(); open(r); ball(r, 0, { wicket: { kind: 'caught' } }, 'f1')
    expect(board(r).players.f1.stats.catches).toBe(1)
  })

  it('credits a run-out to the fielder and not to the bowler', () => {
    const r = recorder(); open(r)
    ball(r, 1, { wicket: { kind: 'run_out', who: 'non_striker' } }, 'f2')
    const b = board(r)
    expect(b.totals.a).toBe(1)
    expect(b.players.f2.stats.run_outs).toBe(1)
    expect(b.players.b1.stats.wickets ?? 0).toBe(0)
    expect(b.players.s2.stats.out).toBe(1)
  })

  it('brings the new batter in at the empty end', () => {
    const r = recorder(); open(r); ball(r, 0, { wicket: { kind: 'bowled' } })
    r.add('new_batter', null, by('s3'))
    const b = board(r)
    expect(detail(b).striker?.id).toBe('s3')
    expect(detail(b).need_batter).toBe(false)
  })

  it('closes the innings when the side is all out', () => {
    const one = cricket.settings({ overs: 2, wickets: 1, bat_first: 'a' })
    const r = recorder(); open(r); ball(r, 0, { wicket: { kind: 'bowled' } })
    const b = board(r, one)
    expect(detail(b).open).toBe(false)
    expect(b.status).toBe('Innings break')
  })
})

describe('cricket innings and result', () => {
  /** Titans make `runs` off the first ball then see out their two overs. */
  function firstInnings(r: Rec, runs: number) {
    open(r); ball(r, runs); dots(r, 5)
    r.add('bowler', null, by('b2')); dots(r, 6)
  }

  it('closes the innings when the overs are bowled', () => {
    const r = recorder(); firstInnings(r, 4)
    const b = board(r)
    expect(detail(b).open).toBe(false)
    expect(detail(b).target).toBe(5)
    expect(b.score.a).toBe('4/0')
  })

  it('starts the reply when the second pair of batters is chosen', () => {
    const r = recorder(); firstInnings(r, 4); reply(r)
    const b = board(r)
    expect(detail(b).innings).toBe(2)
    expect(detail(b).batting).toBe('b')
    expect(detail(b).need).toEqual({ runs: 5, balls: 12 })
    expect(b.status).toBe('2nd innings')
  })

  it('ends the chase the moment the target is passed, won by wickets in hand', () => {
    const r = recorder(); firstInnings(r, 4); reply(r); ball(r, 6)
    const b = board(r)
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('b')
    expect(b.result).toBe('Daredevils won by 10 wickets')
  })

  it('is won by runs when the chase falls short', () => {
    const r = recorder(); firstInnings(r, 4); reply(r); ball(r, 2); dots(r, 5)
    r.add('bowler', null, by('t2')); dots(r, 6)
    const b = board(r)
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('a')
    expect(b.result).toBe('Titans won by 2 runs')
  })

  it('is a tie when the scores finish level', () => {
    const r = recorder(); firstInnings(r, 4); reply(r); ball(r, 4); dots(r, 5)
    r.add('bowler', null, by('t2')); dots(r, 6)
    const b = board(r)
    expect(b.winner).toBe('draw')
    expect(b.result).toBe('Match tied')
  })

  it('lets the referee close an innings early', () => {
    const r = recorder(); open(r); ball(r, 3); r.add('innings_end')
    expect(detail(board(r)).open).toBe(false)
  })

  it('shows a side that has not batted yet with no score', () => {
    const r = recorder(); open(r); ball(r, 1)
    expect(board(r).score.b).toBe('')
  })
})

describe('cricket checks', () => {
  it('refuses a ball before the batters are chosen', () => {
    const r = recorder()
    expect(cricket.check(board(r), s, r.add('ball', null, { data: { runs: 0 } }))).toMatch(/batters/i)
  })

  it('refuses a ball with no bowler', () => {
    const r = recorder()
    r.add('batters', null, { ...by('s1'), ...and('s2') })
    expect(cricket.check(board(r), s, r.add('ball', null, { data: { runs: 0 } }))).toMatch(/bowler/i)
  })

  it('refuses a ball while a batter is still to come in', () => {
    const r = recorder(); open(r); ball(r, 0, { wicket: { kind: 'bowled' } })
    expect(cricket.check(board(r), s, r.add('ball', null, { data: { runs: 0 } }))).toMatch(/batter/i)
  })

  it('allows a ball when the pair and the bowler are set', () => {
    const r = recorder(); open(r)
    expect(cricket.check(board(r), s, r.add('ball', null, { data: { runs: 0 } }))).toBeNull()
  })
})
