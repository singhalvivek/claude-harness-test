-- AlterTable: Phase 2.6 — a trip-level opening feeling (an epigraph for the
-- whole journey), rendered as the FIRST beat on the serpentine before any stop.
-- Additive only — existing trips backfill to NULL, which renders nothing, so
-- every shipped story is byte-for-byte unchanged.
ALTER TABLE "Trip" ADD COLUMN     "feeling" TEXT;

-- NOTE: the new per-stop placement value "before" needs NO migration.
-- "Stop"."feelingPlacement" is a plain TEXT column with a 'card' default and no
-- CHECK constraint or enum type, so the widened value set is enforced only by
-- the zod enums at the API boundary (FEELING_PLACEMENTS in src/lib/api-client.ts).
