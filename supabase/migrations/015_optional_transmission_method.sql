-- =============================================================================
-- MySanad Migration 015: The method of receiving (kaedah pengambilan) is optional
--
-- Teachers may leave it empty for a chain or a link; nothing is filled in on their behalf.
-- Existing values are kept. Idempotent.
-- =============================================================================

ALTER TABLE public.sanad_chains ALTER COLUMN transmission_method DROP NOT NULL;
ALTER TABLE public.sanad_chains ALTER COLUMN transmission_method DROP DEFAULT;
ALTER TABLE public.sanad_edges ALTER COLUMN transmission_relationship DROP NOT NULL;
ALTER TABLE public.sanad_edges ALTER COLUMN transmission_relationship DROP DEFAULT;
