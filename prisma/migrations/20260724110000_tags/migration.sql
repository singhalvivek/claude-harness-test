-- Phase 2 tags (additive, non-destructive): adds the Tag + StopTag join tables
-- only. It does NOT alter or rebuild "Trip", "Stop", or "Photo"; existing data
-- is preserved. The shareSlug / isPublished columns already exist (init migration).

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StopTag" (
    "stopId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("stopId", "tagId"),
    CONSTRAINT "StopTag_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StopTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_label_key" ON "Tag"("label");
