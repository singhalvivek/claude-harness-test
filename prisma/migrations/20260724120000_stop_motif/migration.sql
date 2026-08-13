-- AlterTable (additive, non-destructive): adds the per-stop decorative motif.
-- Pure ADD COLUMN — no table rebuild. Existing stops backfill to 'none' via the
-- column default; no data loss, the existing file:./dev.db is preserved.
-- Enum enforced at the API boundary (zod): none | flower | mountain | tree |
-- train | plane | boat | car | tent | camera | star | compass | sun | heart.
ALTER TABLE "Stop" ADD COLUMN "motif" TEXT NOT NULL DEFAULT 'none';
