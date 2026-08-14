-- AlterTable: Photo becomes MEDIA (photo | video). Additive only — existing rows
-- backfill to kind='photo' with a null poster/duration.
ALTER TABLE "Photo" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'photo',
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "durationSec" DOUBLE PRECISION;

-- AlterTable: per-stop "feeling" quote + how it renders. Additive only —
-- existing stops backfill to feeling=NULL (nothing renders) with the default
-- placement, so every shipped story is unchanged.
ALTER TABLE "Stop" ADD COLUMN     "feeling" TEXT,
ADD COLUMN     "feelingPlacement" TEXT NOT NULL DEFAULT 'card';
