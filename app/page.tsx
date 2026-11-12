import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase-server'
import { SPORTS, ALL_SPORTS, SportType } from '@/lib/sports'
import SportIcon from '@/components/ui/SportIcon'

// Public match counts only — cache for 30s instead of rendering fresh every hit.
export const revalidate = 30

export default async function HomePage() {
  const supabase = createPublicClient()
  const { data: matches } = await supabase
    .from('matches')
    .select('id, sport, status, team_a, team_b')
    .in('status', ['live', 'upcoming'])

  // What is being played right now, with the score as of this render.
  type LiveRow = { id: string; sport: SportType; team_a: string; team_b: string }
  const liveMatches = ((matches ?? []) as (LiveRow & { status: string })[]).filter(m => m.status === 'live')
  const scores = new Map<string, { score?: { a: string; b: string }; status?: string }>()
  if (liveMatches.length) {
    // Separate query: if live scoring is not set up yet, the home page still renders.
    const { data } = await supabase
      .from('match_scores').select('match_id, state').in('match_id', liveMatches.map(m => m.id))
    for (const s of data ?? []) scores.set(s.match_id as string, s.state ?? {})
  }

  const counts: Record<SportType, { live: number; upcoming: number }> = {
    cricket:      { live: 0, upcoming: 0 },
    football:     { live: 0, upcoming: 0 },
    table_tennis: { live: 0, upcoming: 0 },
    volleyball:   { live: 0, upcoming: 0 },
    pool:         { live: 0, upcoming: 0 },
    basketball:   { live: 0, upcoming: 0 },
  }

  ;(matches ?? []).forEach((m: { sport: SportType; status: string }) => {
    if (counts[m.sport]) {
      if (m.status === 'live') counts[m.sport].live++
      else counts[m.sport].upcoming++
    }
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">PrimeStake</h1>
        <p className="text-slate text-sm mt-1">Select a sport to view matches and place bets</p>
      </div>

      {liveMatches.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-crimson-light">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75 animate-ping motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-crimson-light" />
            </span>
            Live now
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {liveMatches.map(m => {
              const s = scores.get(m.id)
              return (
                <Link key={m.id} href={`/sports/${m.sport}/${m.id}`}
                  className="flex items-center justify-between gap-3 bg-table hover:bg-raised border border-rail hover:border-amber/50 rounded-xl px-4 py-3 transition-colors">
                  <div className="min-w-0">
                    <p className="text-xs text-slate">{SPORTS[m.sport]?.label}{s?.status ? ` · ${s.status}` : ''}</p>
                    <p className="text-sm font-semibold text-ink truncate">{m.team_a} vs {m.team_b}</p>
                  </div>
                  {s?.score ? (
                    <p className="text-lg font-bold text-ink tabular-nums shrink-0">
                      {s.score.a || '–'} <span className="text-slate">-</span> {s.score.b || '–'}
                    </p>
                  ) : <span className="text-xs text-amber shrink-0">Watch →</span>}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_SPORTS.map(sport => {
          const { live, upcoming } = counts[sport]
          return (
            <Link
              key={sport}
              href={`/sports/${sport}`}
              className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-baize"
            >
              <div className="flex h-full flex-col bg-table hover:bg-raised border border-rail group-hover:border-amber/50 group-focus-visible:border-amber rounded-xl p-6 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-raised text-slate transition-colors group-hover:text-ink">
                    <SportIcon sport={sport} className="h-7 w-7" />
                  </div>
                  <span
                    aria-hidden="true"
                    className="text-amber transition-transform duration-200 group-hover:translate-x-1"
                  >
                    →
                  </span>
                </div>

                <h2 className="mt-4 text-lg font-bold text-ink">{SPORTS[sport].label}</h2>

                <div className="mt-1.5 min-h-[36px] space-y-0.5">
                  {live > 0 && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-crimson-light">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75 animate-ping motion-reduce:hidden" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-crimson-light" />
                      </span>
                      {live} match{live > 1 ? 'es' : ''} live now
                    </p>
                  )}
                  {upcoming > 0 && (
                    <p className="text-xs text-slate">{upcoming} upcoming</p>
                  )}
                  {live === 0 && upcoming === 0 && (
                    <p className="text-xs text-slate">No matches scheduled</p>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
