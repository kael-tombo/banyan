-- Supervised autonomy (Level 2): the founder-set policy, JSON. "{}" = approve each draft.
ALTER TABLE "Workspace" ADD COLUMN "autonomyPolicy" TEXT NOT NULL DEFAULT '{}';
