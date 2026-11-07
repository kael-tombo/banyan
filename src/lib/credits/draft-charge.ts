import { prisma } from "@/lib/db";
import { BudgetExceededError, finalizeReservation, InsufficientCreditsError, reserveCredits } from "./service";

/**
 * Charging workflow drafts (R4). A draft task is priced like a draft from a
 * strategy: one credit, held before any model work and spent only when a
 * model wrote the draft. A template draft, a failed run or a crash returns
 * the hold. A goal's drafts share its optional credit budget, so a cycle
 * cannot spend more than the founder set for it.
 */

export const WORKFLOW_DRAFT_CREDITS = 1;

/** Every hold of one goal's drafts starts with this, which is what its budget counts. */
export function goalDraftPrefix(goalId: string): string {
  return `goal:${goalId}:draft:`;
}

/** One hold per task attempt: a retry after a release is a new hold; repeating an attempt reuses it. */
export function draftHoldKey(goalId: string | null, taskId: string, attempt: number): string {
  return `${goalId ? goalDraftPrefix(goalId) : "task-draft:"}${taskId}:a${attempt}`;
}

export type DraftHold =
  | { ok: true; key: string }
  | { ok: false; reason: string; actionable: string };

/** What a refused hold tells the founder. Pure, so the wording is tested. */
export function refusal(err: unknown): { reason: string; actionable: string } | null {
  if (err instanceof BudgetExceededError) {
    return {
      reason: `This goal's drafts have used ${err.used} of the ${err.limit}-credit budget set for them. Nothing was started.`,
      actionable: "Raise or clear the goal's credit budget on the goal page, then retry this task.",
    };
  }
  if (err instanceof InsufficientCreditsError) {
    return { reason: err.message, actionable: "Add credits on the Credits page, then retry this task." };
  }
  return null;
}

export async function holdDraftCredit(input: { workspaceId: string; goalId: string | null; taskId: string; attempt: number; channel: string }): Promise<DraftHold> {
  const key = draftHoldKey(input.goalId, input.taskId, input.attempt);
  const goal = input.goalId ? await prisma.goal.findFirst({ where: { id: input.goalId, workspaceId: input.workspaceId }, select: { creditBudget: true } }) : null;
  const budget = input.goalId && goal?.creditBudget != null ? { keyPrefix: goalDraftPrefix(input.goalId), limit: goal.creditBudget } : undefined;
  try {
    await reserveCredits(input.workspaceId, WORKFLOW_DRAFT_CREDITS, key, { note: `Workflow draft for ${input.channel}`, budget });
    return { ok: true, key };
  } catch (err) {
    const r = refusal(err);
    if (r) return { ok: false, ...r };
    throw err;
  }
}

/** Spend the hold when a model wrote the draft; return it otherwise. Safe to repeat. */
export async function settleDraftCredit(workspaceId: string, key: string, modelWritten: boolean) {
  await finalizeReservation(workspaceId, key, modelWritten ? WORKFLOW_DRAFT_CREDITS : 0);
}
