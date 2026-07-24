-- AlterTable (additive, non-destructive): backfills existing rows to 'cinematic'
ALTER TABLE "Trip" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'cinematic';
