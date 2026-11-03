-- Email preferences (weekly autopilot summary opt-out) and an idempotency key for outbox messages,
-- so a periodic sweep can never queue the same scheduled email twice.

ALTER TABLE "User" ADD COLUMN "emailPrefs" TEXT;

ALTER TABLE "EmailMessage" ADD COLUMN "dedupeKey" TEXT;
CREATE UNIQUE INDEX "EmailMessage_dedupeKey_key" ON "EmailMessage"("dedupeKey");
