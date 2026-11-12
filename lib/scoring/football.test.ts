import { describe, it, expect } from 'vitest'
import { football, clockSeconds, minuteLabel, type FootballDetail } from './football'
import { recorder, TEAMS, by, and } from './test-helpers'

const s = football.settings({ half_minutes: 45, et_minutes: 15 })
const detail = (b: { detail: unknown }) => b.detail as FootballDetail
const T0 = Date.parse('2026-01-01T10:00:00.000Z')
const at = (seconds: number) => new Date(T0 + seconds * 1000).toISOString()

const start = (r: ReturnType<typeof recorder>, period: string, sec: number) =>
  r.add('period_start', null, { data: { period, at: at(sec) } })
const end = (r: ReturnType<typeof recorder>, sec: number) =>
  r.add('period_end', null, { data: { at: at(sec) } })

/** Play both halves with no goals, ending level at full time. */
function fullTime(r: ReturnType<typeof recorder>) {
  start(r, '1H', 0); end(r, 2700); start(r, '2H', 3600); end(r, 6300)
}

describe('football clock', () => {
  it('starts the clock from zero at kick-off', () => {
    const r = recorder()
    start(r, '1H', 0)
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.clock).toEqual({ running: true, started_at: at(0), banked_s: 0, base_s: 0 })
    expect(b.status).toBe('1st half')
  })

  it('banks the elapsed time when paused', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('clock_pause', null, { data: { at: at(600) } })
    expect(football.reduce(s, r.events, TEAMS).clock).toMatchObject({ running: false, banked_s: 600 })
  })

  it('carries the banked time on when resumed', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('clock_pause', null, { data: { at: at(600) } })
    r.add('clock_resume', null, { data: { at: at(900) } })
    const clock = football.reduce(s, r.events, TEAMS).clock!
    expect(clock).toMatchObject({ running: true, started_at: at(900), banked_s: 600 })
    // 5 minutes of stoppage are not counted: 10 banked + 1 since resuming.
    expect(clockSeconds(clock, T0 + 960_000)).toBe(660)
  })

  it('starts the second half from the length of the first, however long the first ran', () => {
    const r = recorder()
    start(r, '1H', 0); end(r, 2900); start(r, '2H', 4000)
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.clock).toMatchObject({ running: true, base_s: 2700, banked_s: 0 })
    expect(b.status).toBe('2nd half')
  })

  it('stops the clock and reports half time when the half ends', () => {
    const r = recorder()
    start(r, '1H', 0); end(r, 2800)
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.clock!.running).toBe(false)
    expect(b.status).toBe('Half time')
  })

  it('labels a minute inside the half and in stoppage time', () => {
    expect(minuteLabel(125, '1H', s)).toBe("3'")
    expect(minuteLabel(45 * 60 + 70, '1H', s)).toBe("45+2'")
    expect(minuteLabel(45 * 60 + 5, '2H', s)).toBe("46'")
  })
})

describe('football entries', () => {
  it('credits a goal to the side, the scorer and the assister, stamped with the minute', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('goal', 'a', { ...by('p9'), ...and('p10'), data: { clock_s: 125 } })
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.totals).toEqual({ a: 1, b: 0 })
    expect(b.players.p9.stats.goals).toBe(1)
    expect(b.players.p10.stats.assists).toBe(1)
    expect(b.feed[0].tag).toBe("3'")
  })

  it('gives an own goal to the other side and not to the scorer as a goal', () => {
    const r = recorder()
    start(r, '1H', 0)
    // side is the team that benefits; the player is the unlucky defender.
    r.add('goal', 'a', { ...by('d4'), data: { own_goal: true, clock_s: 60 } })
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.totals.a).toBe(1)
    expect(b.players.d4.stats.goals ?? 0).toBe(0)
    expect(b.players.d4.stats.own_goals).toBe(1)
    expect(b.players.d4.side).toBe('b')
  })

  it('names the first scorer, skipping own goals', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('goal', 'a', { ...by('d4'), data: { own_goal: true, clock_s: 60 } })
    r.add('goal', 'b', { ...by('p7'), data: { clock_s: 300 } })
    r.add('goal', 'a', { ...by('p9'), data: { clock_s: 900 } })
    expect(football.reduce(s, r.events, TEAMS).first_scorer).toEqual({ id: 'p7', name: 'P7' })
  })

  it('turns a second yellow into a red', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('yellow', 'b', { ...by('p5'), data: { clock_s: 100 } })
    r.add('yellow', 'b', { ...by('p5'), data: { clock_s: 900 } })
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.players.p5.stats.yellows).toBe(2)
    expect(b.players.p5.stats.reds).toBe(1)
  })

  it('records who fouled', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('foul', 'a', { ...by('p3'), data: { clock_s: 30 } })
    expect(football.reduce(s, r.events, TEAMS).players.p3.stats.fouls).toBe(1)
  })

  it('shows the added minutes the referee has announced for this period', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('added_time', null, { data: { minutes: 3 } })
    expect(detail(football.reduce(s, r.events, TEAMS)).added).toBe(3)
  })
})

describe('football result', () => {
  it('is decided at full time when one side leads', () => {
    const r = recorder()
    start(r, '1H', 0)
    r.add('goal', 'a', { ...by('p9'), data: { clock_s: 60 } })
    end(r, 2700); start(r, '2H', 3600); end(r, 6300)
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.status).toBe('Full time')
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('a')
    expect(b.result).toBe('Titans won 1-0')
  })

  it('offers extra time only when level at full time', () => {
    const r = recorder()
    fullTime(r)
    const level = football.reduce(s, r.events, TEAMS)
    expect(level.complete).toBe(false)
    expect(detail(level).next_period).toBe('ET1')
    expect(level.result).toBe('Draw 0-0')
  })

  it('runs extra time from the 90th minute', () => {
    const r = recorder()
    fullTime(r); start(r, 'ET1', 7000)
    const b = football.reduce(s, r.events, TEAMS)
    expect(b.clock).toMatchObject({ running: true, base_s: 5400 })
    expect(b.status).toBe('Extra time, 1st half')
  })

  it('settles a level match on penalties once the shootout is beyond reach', () => {
    const r = recorder()
    fullTime(r)
    r.add('shootout_start')
    // a scores 3, b misses 3: with two kicks each left b cannot catch up.
    for (let i = 0; i < 3; i++) {
      r.add('pen', 'a', { data: { scored: true } })
      r.add('pen', 'b', { data: { scored: false } })
    }
    const b = football.reduce(s, r.events, TEAMS)
    expect(detail(b).shootout).toMatchObject({ a: 3, b: 0, decided: true })
    expect(b.complete).toBe(true)
    expect(b.winner).toBe('a')
    expect(b.result).toBe('Titans won 3-0 on penalties (0-0)')
    expect(b.totals).toEqual({ a: 0, b: 0 })
  })

  it('keeps a shootout open while it can still be turned around', () => {
    const r = recorder()
    fullTime(r)
    r.add('shootout_start')
    r.add('pen', 'a', { data: { scored: true } })
    r.add('pen', 'b', { data: { scored: false } })
    expect(detail(football.reduce(s, r.events, TEAMS)).shootout!.decided).toBe(false)
  })

  it('goes to sudden death after five kicks each', () => {
    const r = recorder()
    fullTime(r)
    r.add('shootout_start')
    for (let i = 0; i < 5; i++) {
      r.add('pen', 'a', { data: { scored: true } })
      r.add('pen', 'b', { data: { scored: true } })
    }
    expect(detail(football.reduce(s, r.events, TEAMS)).shootout!.decided).toBe(false)
    r.add('pen', 'a', { data: { scored: true } })
    r.add('pen', 'b', { data: { scored: false } })
    expect(detail(football.reduce(s, r.events, TEAMS)).shootout!.decided).toBe(true)
  })
})

describe('football checks', () => {
  it('refuses a goal before kick-off', () => {
    const r = recorder()
    const b = football.reduce(s, r.events, TEAMS)
    expect(football.check(b, s, r.add('goal', 'a'))).toMatch(/kick/i)
  })

  it('refuses to start a period out of order', () => {
    const r = recorder()
    const b = football.reduce(s, r.events, TEAMS)
    expect(football.check(b, s, r.add('period_start', null, { data: { period: '2H' } }))).not.toBeNull()
    expect(football.check(b, s, r.add('period_start', null, { data: { period: '1H' } }))).toBeNull()
  })

  it('refuses a shootout kick outside a shootout', () => {
    const r = recorder()
    start(r, '1H', 0)
    const b = football.reduce(s, r.events, TEAMS)
    expect(football.check(b, s, r.add('pen', 'a', { data: { scored: true } }))).not.toBeNull()
  })

  it('refuses to pause a clock that is not running', () => {
    const r = recorder()
    start(r, '1H', 0); end(r, 2700)
    const b = football.reduce(s, r.events, TEAMS)
    expect(football.check(b, s, r.add('clock_pause'))).not.toBeNull()
  })
})
