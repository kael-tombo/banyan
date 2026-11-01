-- US-042/US-043: versioned, structured distribution strategies.
CREATE TABLE "Strategy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "goalId" TEXT,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "body" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fallbackReason" TEXT,
    "facts" TEXT NOT NULL DEFAULT '[]',
    "objective" TEXT NOT NULL DEFAULT '',
    "profileVersion" INTEGER NOT NULL,
    "promptName" TEXT,
    "promptVersion" INTEGER,
    "modelCallId" TEXT,
    "createdById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Strategy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Strategy_workspaceId_version_key" ON "Strategy"("workspaceId", "version");
CREATE INDEX "Strategy_workspaceId_status_idx" ON "Strategy"("workspaceId", "status");
ALTER TABLE "Strategy" ADD CONSTRAINT "Strategy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
