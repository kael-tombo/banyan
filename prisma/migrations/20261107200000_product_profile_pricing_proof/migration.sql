-- Onboarding reads pricing and proof (customers, counts, ratings, quotes) from the founder's site.
-- Kept on the profile so the strategy and the claims check can use them. Additive and nullable.
ALTER TABLE "ProductProfile" ADD COLUMN "pricing" TEXT;
ALTER TABLE "ProductProfile" ADD COLUMN "proofPoints" TEXT NOT NULL DEFAULT '[]';
