-- US-028 / ADR-003: Postiz is removed from Banyan.
-- Existing Postiz connections are kept for the audit trail but can never publish again.
UPDATE "ChannelConnection"
SET "status" = 'removed',
    "lastError" = 'Postiz was removed from Banyan. This connection is kept for the record and cannot publish.'
WHERE "adapter" = 'postiz';

ALTER TABLE "ChannelConnection" ALTER COLUMN "adapter" SET DEFAULT 'socialflow';
