import { describe, it, expect } from 'vitest'
import { MarketSchema } from './markets'
import { ALL_SPORTS, SPORT_MARKETS } from './sports'

const base = { match_id: '3f1c7a2e-8b4d-4c6e-9a1f-2b3c4d5e6f70', options: ['A', 'B'], title: 'Title' }

describe('MarketSchema', () => {
  // The admin form offers these per sport; the API must accept every one, or
  // creating that market fails with a bare "Invalid request".
  for (const sport of ALL_SPORTS) {
    for (const market of SPORT_MARKETS[sport]) {
      it(`accepts the "${market.label}" market offered for ${sport}`, () => {
        expect(MarketSchema.safeParse({ ...base, market_type: market.value }).success).toBe(true)
      })
    }
  }

  it('rejects a market type nothing offers', () => {
    expect(MarketSchema.safeParse({ ...base, market_type: 'bogus' }).success).toBe(false)
  })

  it('needs at least two options', () => {
    expect(MarketSchema.safeParse({ ...base, market_type: 'winner', options: ['Only'] }).success).toBe(false)
  })
})
