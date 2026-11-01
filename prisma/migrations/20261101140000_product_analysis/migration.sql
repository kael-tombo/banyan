-- US-021 / US-022: product website analyses.
CREATE TABLE "ProductAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "pages" TEXT NOT NULL DEFAULT '[]',
    "result" TEXT,
    "method" TEXT,
    "flags" TEXT NOT NULL DEFAULT '[]',
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductAnalysis_workspaceId_createdAt_idx" ON "ProductAnalysis"("workspaceId", "createdAt");

ALTER TABLE "ProductAnalysis" ADD CONSTRAINT "ProductAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
