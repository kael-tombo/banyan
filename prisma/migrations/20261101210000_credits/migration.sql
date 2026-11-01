-- US-055/056/062: credit ledger and the lockable balance row.
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reservationKey" TEXT,
    "campaignId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CreditEntry_workspaceId_idempotencyKey_key" ON "CreditEntry"("workspaceId", "idempotencyKey");
CREATE INDEX "CreditEntry_workspaceId_createdAt_idx" ON "CreditEntry"("workspaceId", "createdAt");
CREATE INDEX "CreditEntry_workspaceId_reservationKey_idx" ON "CreditEntry"("workspaceId", "reservationKey");
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CreditAccount" (
    "workspaceId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("workspaceId")
);
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
