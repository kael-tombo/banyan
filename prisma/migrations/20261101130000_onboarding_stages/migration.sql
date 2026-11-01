-- US-018 / US-019: onboarding stage progress and workspace business basics.
ALTER TABLE "Workspace" ADD COLUMN "businessName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Workspace" ADD COLUMN "industry" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Workspace" ADD COLUMN "businessModel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Workspace" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE "OnboardingStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnboardingStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingStage_workspaceId_stage_key" ON "OnboardingStage"("workspaceId", "stage");

ALTER TABLE "OnboardingStage" ADD CONSTRAINT "OnboardingStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Workspaces that already finished the old wizard keep their progress.
INSERT INTO "OnboardingStage" ("id", "workspaceId", "stage", "status", "updatedAt")
SELECT 'mig_' || m."workspaceId" || '_' || s.stage, m."workspaceId", s.stage, 'done', NOW()
FROM (SELECT DISTINCT ms."workspaceId" FROM "Membership" ms JOIN "User" u ON u.id = ms."userId" WHERE u."onboardingCompletedAt" IS NOT NULL) m
CROSS JOIN (VALUES ('account'), ('workspace'), ('business'), ('preferences')) AS s(stage)
ON CONFLICT DO NOTHING;
