-- Agent activity control: human-controlled pause for the orchestrator.
ALTER TABLE "Workspace" ADD COLUMN "agentsPausedAt" TIMESTAMP(3);
