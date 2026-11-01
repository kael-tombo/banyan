-- US-046: one campaign lifecycle. Existing statuses map to the nearest state;
-- in-progress campaigns start in content review and are re-derived from their
-- content on the next content event.
ALTER TABLE "Campaign" ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Campaign" ADD COLUMN "pausedFrom" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "strategyId" TEXT;
UPDATE "Campaign" SET "lifecycle" = CASE "status"
  WHEN 'planned' THEN 'approved'
  WHEN 'in_progress' THEN 'content_review'
  WHEN 'completed' THEN 'completed'
  WHEN 'archived' THEN 'cancelled'
  ELSE 'draft' END;
CREATE UNIQUE INDEX "Campaign_strategyId_key" ON "Campaign"("strategyId");
