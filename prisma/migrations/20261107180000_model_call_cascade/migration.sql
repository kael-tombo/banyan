-- TD-17: deleting a workspace failed once it had any model usage. Usage rows now go with their workspace.
ALTER TABLE "ModelCall" DROP CONSTRAINT "ModelCall_workspaceId_fkey";
ALTER TABLE "ModelCall" ADD CONSTRAINT "ModelCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
