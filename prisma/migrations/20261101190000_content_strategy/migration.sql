-- US-044: drafts written from an approved strategy, with pre-review flags.
ALTER TABLE "ContentItem" ADD COLUMN "strategyId" TEXT;
ALTER TABLE "ContentItem" ADD COLUMN "angle" TEXT;
ALTER TABLE "ContentItem" ADD COLUMN "checks" TEXT NOT NULL DEFAULT '[]';
CREATE INDEX "ContentItem_workspaceId_strategyId_idx" ON "ContentItem"("workspaceId", "strategyId");
