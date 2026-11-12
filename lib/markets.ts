// ── Market creation rules, shared by the API and its tests ──
import { z } from 'zod'

// Every value of the database's market_type enum. The admin form offers a
// per-sport subset of these (lib/sports.ts SPORT_MARKETS); a test checks each
// one it offers is accepted here, so the two cannot drift apart again.
export const MARKET_TYPES = [
  'winner', 'top_scorer', 'over_under', 'live', 'custom',
  'first_goal_scorer', 'set_winner', 'handicap', 'frame_handicap',
] as const

export const MarketSchema = z.object({
  match_id: z.string().uuid(),
  market_type: z.enum(MARKET_TYPES),
  title: z.string().min(1).max(80).optional(), // required when market_type === 'custom'
  house_edge_pct: z.number().min(0).max(20).optional(),
  seed_amount: z.number().min(0).max(100000).optional(),
  options: z.array(z.string().min(1)).min(2), // labels for bet options
})
