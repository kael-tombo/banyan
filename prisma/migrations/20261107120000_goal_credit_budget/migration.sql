-- A per-cycle credit budget for drafts (R4). Null keeps the old behaviour: only the balance limits them.
ALTER TABLE "Goal" ADD COLUMN "creditBudget" INTEGER;
