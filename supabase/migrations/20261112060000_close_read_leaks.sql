-- Close two read leaks that combined, and pin function search paths.
--
-- 1. The leaderboard view ran with its owner's rights, so the public API
--    served every account's id, balance and winnings to anyone, signed in or
--    not, past the RLS on profiles. Both apps read it only on the server with
--    the service-role key, so the public API loses nothing it used.
--
-- 2. get_bet_estimates took any user id. Any signed-in player could pass
--    another player's id (freely available from the view above) and read
--    their pending bets and expected payouts. It now answers only for the
--    caller; the service role may still ask about anyone.
--
-- 3. The SECURITY DEFINER functions resolved names through the caller's
--    search_path. Nobody untrusted can create objects today, so this was not
--    exploitable, but pinning it removes the possibility. It is pinned to the
--    path they already resolved through, so no function changes behaviour.

-- ── 1. leaderboard ──────────────────────────────────────────
REVOKE ALL ON public.leaderboard FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.leaderboard TO service_role;
-- Run as the reader. The service role bypasses RLS, so the server still sees
-- every row; anyone else would only see what profiles' RLS allows.
ALTER VIEW public.leaderboard SET (security_invoker = true);

-- ── 2. get_bet_estimates ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_bet_estimates(p_user_id uuid)
 RETURNS TABLE(bet_id uuid, expected_payout numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
BEGIN
  -- A player may only ask about their own bets.
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND coalesce(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id AS bet_id,
    ROUND(
      (b.amount / NULLIF(winner_totals.total_on_option, 0))
      * m.total_pool
      * (1 - m.house_edge_pct / 100),
      2
    ) AS expected_payout
  FROM bets b
  JOIN markets m ON m.id = b.market_id
  JOIN (
    -- Total pending amount staked on the same option in the same market
    SELECT market_id, bet_option_id, SUM(amount) AS total_on_option
    FROM bets
    WHERE status = 'pending'
    GROUP BY market_id, bet_option_id
  ) winner_totals
    ON winner_totals.market_id = b.market_id
    AND winner_totals.bet_option_id = b.bet_option_id
  WHERE b.user_id = p_user_id
    AND b.status = 'pending';
END;
$function$;

REVOKE ALL ON FUNCTION public.get_bet_estimates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_bet_estimates(uuid) TO authenticated, service_role;

-- ── 3. pin search_path on the rest ──────────────────────────
ALTER FUNCTION public.apply_settlement(uuid, uuid, jsonb, uuid[], boolean) SET search_path = public, extensions;
ALTER FUNCTION public.enter_contest(uuid, uuid, uuid[], uuid, uuid)        SET search_path = public, extensions;
ALTER FUNCTION public.get_financial_overview()                             SET search_path = public, extensions;
ALTER FUNCTION public.handle_new_user()                                    SET search_path = public, extensions;
ALTER FUNCTION public.place_bet(uuid, uuid, uuid, numeric)                 SET search_path = public, extensions;
ALTER FUNCTION public.reset_all_financials()                               SET search_path = public, extensions;
ALTER FUNCTION public.reset_cash_collected()                               SET search_path = public, extensions;
ALTER FUNCTION public.reset_season()                                       SET search_path = public, extensions;
ALTER FUNCTION public.reset_wallet(uuid, text)                             SET search_path = public, extensions;
ALTER FUNCTION public.settle_contest(uuid, jsonb, boolean)                 SET search_path = public, extensions;
ALTER FUNCTION public.topup_wallet(uuid, numeric, text)                    SET search_path = public, extensions;
ALTER FUNCTION public.void_bet(uuid, text)                                 SET search_path = public, extensions;
