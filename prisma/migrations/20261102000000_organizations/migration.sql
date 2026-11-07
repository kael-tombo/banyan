-- ADR-005 / BOS-001: organizations above workspaces (a workspace is a product).
-- Lossless backfill: every existing workspace gets its own organization; its members carry over
-- (owner -> OWNER, everyone else -> MEMBER). organizationId becomes required only after the backfill.

CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");
CREATE INDEX "OrganizationMember_userId_idx" ON "OrganizationMember"("userId");

ALTER TABLE "Workspace" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "productType" TEXT NOT NULL DEFAULT 'saas';
ALTER TABLE "Workspace" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- Backfill: one organization per existing workspace.
INSERT INTO "Organization" ("id", "name", "slug", "timeZone", "createdAt")
SELECT 'org_' || w."id",
       CASE WHEN w."businessName" <> '' THEN w."businessName" ELSE w."name" END,
       'org-' || w."slug",
       w."timeZone",
       w."createdAt"
FROM "Workspace" w;

UPDATE "Workspace" SET "organizationId" = 'org_' || "id";

INSERT INTO "OrganizationMember" ("id", "organizationId", "userId", "role", "createdAt")
SELECT 'om_' || m."id", 'org_' || m."workspaceId", m."userId",
       CASE WHEN m."role" = 'owner' THEN 'OWNER' ELSE 'MEMBER' END,
       CURRENT_TIMESTAMP
FROM "Membership" m;

ALTER TABLE "Workspace" ALTER COLUMN "organizationId" SET NOT NULL;
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
