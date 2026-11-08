-- US-045: prompt versioning on the model-call ledger.
ALTER TABLE "ModelCall" ADD COLUMN "promptName" TEXT;
ALTER TABLE "ModelCall" ADD COLUMN "promptVersion" INTEGER;
ALTER TABLE "ModelCall" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ModelCall" ADD COLUMN "schemaValid" BOOLEAN;
CREATE INDEX "ModelCall_workspaceId_promptName_promptVersion_idx" ON "ModelCall"("workspaceId", "promptName", "promptVersion");
