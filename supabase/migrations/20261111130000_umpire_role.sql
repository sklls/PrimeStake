-- A third kind of account: the referee who scores matches live.
-- In its own migration because Postgres will not let a new enum value be
-- used inside the transaction that adds it.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'umpire';
