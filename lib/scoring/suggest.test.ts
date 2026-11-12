import { describe, it, expect } from 'vitest'
import { suggest } from './suggest'
import { fantasyStats } from './stats'
import { football } from './football'
import { cricket } from './cricket'
import { recorder, TEAMS, by, and } from './test-helpers'

const fs = football.settings({})
const at = (sec: number) => new Date(Date.parse('2026-01-01T10:00:00Z') + sec * 1000).toISOString()

/** Titans 2-1 Daredevils, finished. p9 scores twice, p7 once and first. */
function finishedFootball() {
  const r = recorder()
  r.add('period_start', null, { data: { period: '1H', at: at(0) } })
  r.add('goal', 'b', { ...by('p7'), data: { clock_s: 60 } })
  r.add('goal', 'a', { ...by('p9'), ...and('p10'), data: { clock_s: 600 } })
  r.add('yellow', 'a', { ...by('p9'), data: { clock_s: 700 } })
  r.add('period_end', null, { data: { at: at(2700) } })
  r.add('period_start', null, { data: { period: '2H', at: at(3600) } })
  r.add('goal', 'a', { ...by('p9'), data: { clock_s: 4000 } })
  r.add('period_end', null, { data: { at: at(6300) } })
  r.add('end_match')
  return football.reduce(fs, r.events, TEAMS)
}

const opts = (...labels: string[]) => labels.map((label, i) => ({ id: `o${i}`, label }))

describe('suggested winners', () => {
  it('suggests the winning side for a match-winner market', () => {
    const s = suggest('winner', opts('Titans', 'Daredevils'), finishedFootball(), TEAMS)
    expect(s.option_id).toBe('o0')
    expect(s.note).toBe('Titans won 2-1')
  })

  it('matches option labels without caring about case or stray spaces', () => {
    const s = suggest('winner', opts(' titans ', 'DAREDEVILS'), finishedFootball(), TEAMS)
    expect(s.option_id).toBe('o0')
  })

  it('suggests nothing while the match is still being played', () => {
    const r = recorder()
    r.add('period_start', null, { data: { period: '1H', at: at(0) } })
    r.add('goal', 'a', { ...by('p9'), data: { clock_s: 60 } })
    const live = football.reduce(fs, r.events, TEAMS)
    expect(suggest('winner', opts('Titans', 'Daredevils'), live, TEAMS).option_id).toBeNull()
  })

  it('suggests the outright top scorer by name', () => {
    const s = suggest('top_scorer', opts('P7', 'P9', 'P10'), finishedFootball(), TEAMS)
    expect(s.option_id).toBe('o1')
    expect(s.note).toContain('P9')
  })

  it('suggests no top scorer when two players are level', () => {
    const r = recorder()
    r.add('period_start', null, { data: { period: '1H', at: at(0) } })
    r.add('goal', 'a', { ...by('p9'), data: { clock_s: 60 } })
    r.add('goal', 'b', { ...by('p7'), data: { clock_s: 90 } })
    r.add('end_match')
    const b = football.reduce(fs, r.events, TEAMS)
    expect(suggest('top_scorer', opts('P7', 'P9'), b, TEAMS).option_id).toBeNull()
  })

  it('suggests the first goal scorer', () => {
    const s = suggest('first_goal_scorer', opts('P9', 'P7'), finishedFootball(), TEAMS)
    expect(s.option_id).toBe('o1')
  })

  it('suggests over or under when both labels name the same line', () => {
    const b = finishedFootball()   // three goals
    expect(suggest('over_under', opts('Over 2.5', 'Under 2.5'), b, TEAMS).option_id).toBe('o0')
    expect(suggest('over_under', opts('Over 3.5', 'Under 3.5'), b, TEAMS).option_id).toBe('o1')
  })

  it('shows the total but suggests nothing when the over/under labels are not a clean pair', () => {
    const s = suggest('over_under', opts('Lots of goals', 'Few goals'), finishedFootball(), TEAMS)
    expect(s.option_id).toBeNull()
    expect(s.note).toContain('3')
  })

  it('suggests nothing for a custom market but still reports the result', () => {
    const s = suggest('custom', opts('Yes', 'No'), finishedFootball(), TEAMS)
    expect(s.option_id).toBeNull()
    expect(s.note).toBe('Titans won 2-1')
  })
})

describe('fantasy stats from the record', () => {
  it('fills football goals, assists and cards for everyone who appears', () => {
    const rows = fantasyStats('football', finishedFootball())
    const p9 = rows.find(r => r.player_id === 'p9')!
    expect(p9).toMatchObject({ played: true, goals: 2, assists: 0, yellows: 1, reds: 0 })
    expect(rows.find(r => r.player_id === 'p10')).toMatchObject({ played: true, assists: 1 })
  })

  it('fills cricket runs, sixes, wickets, catches and run-outs', () => {
    const cs = cricket.settings({ overs: 1, bat_first: 'a' })
    const r = recorder()
    r.add('batters', null, { ...by('s1'), ...and('s2') })
    r.add('bowler', null, by('b1'))
    r.add('ball', null, { data: { runs: 6 } })
    r.add('ball', null, { data: { runs: 0, wicket: { kind: 'caught' } }, ...and('f1') })
    const rows = fantasyStats('cricket', cricket.reduce(cs, r.events, TEAMS))
    expect(rows.find(x => x.player_id === 's1')).toMatchObject({ played: true, runs: 6, sixes: 1 })
    expect(rows.find(x => x.player_id === 'b1')).toMatchObject({ played: true, wickets: 1 })
    expect(rows.find(x => x.player_id === 'f1')).toMatchObject({ played: true, catches: 1 })
  })
})
