'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Scoreboard, Teams } from '@/lib/scoring/types'
import ScoreboardView from './ScoreboardView'

// The public live view. Follows the match's score row over Supabase realtime,
// so the score changes on screen moments after the referee taps. Needs no
// sign-in: the row is readable by anyone.
export default function LiveScoreboard({
  matchId, teams, initial,
}: {
  matchId: string
  teams: Teams
  initial: Scoreboard | null
}) {
  const [board, setBoard] = useState<Scoreboard | null>(initial)

  useEffect(() => {
    const supabase = createClient()

    const refetch = async () => {
      const { data } = await supabase.from('match_scores').select('state').eq('match_id', matchId).maybeSingle()
      if (data?.state) setBoard(data.state as Scoreboard)
    }

    const channel = supabase
      .channel(`score-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_scores', filter: `match_id=eq.${matchId}` },
        payload => {
          const next = (payload.new as { state?: Scoreboard } | null)?.state
          if (next) setBoard(next)
        },
      )
      .subscribe()

    // A phone that slept may have missed updates: catch up when it wakes.
    const onVisible = () => { if (document.visibilityState === 'visible') refetch() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [matchId])

  if (!board) return null
  return <ScoreboardView board={board} teams={teams} />
}
