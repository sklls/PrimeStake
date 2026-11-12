-- Live scoring. Purely additive: nothing existing is altered, so anything
-- still reading this database without knowing about these tables is unaffected.
--
-- match_events is the record: one row per thing a referee enters. Rows are
-- never deleted; an undo marks the row voided so corrections stay visible.
--
-- match_scores is one row per match holding the scoreboard computed from the
-- live (not voided) events. It is never edited by hand — the server recomputes
-- it from the whole record after every change, so the two cannot drift apart.

CREATE TABLE IF NOT EXISTS match_scores (
  match_id    uuid PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  sport       sport_type  NOT NULL,
  settings    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  state       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Bumped on every change. A write must name the version it last saw, which
  -- stops a stale phone or a second scorer overwriting the record.
  version     integer     NOT NULL DEFAULT 0,
  scorer_id   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  scorer_name text,
  started_at  timestamptz,
  ended_at    timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seq          integer     NOT NULL,
  type         text        NOT NULL,
  side         text        CHECK (side IN ('a', 'b')),
  player_id    uuid        REFERENCES team_players(id) ON DELETE SET NULL,
  player_name  text,
  player2_id   uuid        REFERENCES team_players(id) ON DELETE SET NULL,
  player2_name text,
  data         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  voided_at    timestamptz,
  voided_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  edited_at    timestamptz,
  edited_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (match_id, seq)
);

ALTER TABLE match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

-- Anyone may watch, signed in or not. There are no write policies: every write
-- goes through a server route that checks the caller is a referee or an admin.
DO $$ BEGIN
  CREATE POLICY "Anyone can view match scores" ON match_scores FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Anyone can view match events" ON match_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Spectators follow one row per match; the recent feed rides inside its state.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE match_scores;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
