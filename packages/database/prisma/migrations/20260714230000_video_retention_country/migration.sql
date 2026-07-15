ALTER TABLE "VideoProject"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "purgeAfter" TIMESTAMP(3),
ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'VISIBLE',
ADD COLUMN "hiddenFromUserIds" JSONB,
ADD COLUMN "targetUserIds" JSONB,
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'GLOBAL',
ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "VideoProject_purgeAfter_idx" ON "VideoProject"("purgeAfter");
CREATE INDEX "VideoProject_country_idx" ON "VideoProject"("country");
