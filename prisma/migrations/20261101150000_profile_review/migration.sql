-- US-023: structured profile fields, field sources and approval.
ALTER TABLE "ProductProfile" ADD COLUMN "features" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductProfile" ADD COLUMN "problemsSolved" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductProfile" ADD COLUMN "differentiators" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductProfile" ADD COLUMN "missingInformation" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProductProfile" ADD COLUMN "fieldSources" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ProductProfile" ADD COLUMN "lastAnalysisId" TEXT;
ALTER TABLE "ProductProfile" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "ProductProfile" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "ProductProfile" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
