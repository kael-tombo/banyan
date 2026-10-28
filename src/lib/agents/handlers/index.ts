import { handlePlanDraft, handleResearch, handleStrategy } from "@/lib/agents/handlers/planning";
import { handleCampaignPlan, handleContentDraft, handleApprovalGate, handlePublish } from "@/lib/agents/handlers/distribution";
import { handleMeasure, handleEvaluate, handleRecommend } from "@/lib/agents/handlers/analysis";
import type { TaskHandler } from "@/lib/agents/types";
import type { TaskType } from "@/lib/state-machines";

/**
 * Registry of agent handlers by task type. The orchestrator dispatches here;
 * each handler owns its own verification contract (declared on the task) and
 * returns an explicit outcome.
 */
export const HANDLERS: Record<TaskType, TaskHandler> = {
  plan_draft: handlePlanDraft,
  research: handleResearch,
  strategy: handleStrategy,
  campaign_plan: handleCampaignPlan,
  content_draft: handleContentDraft,
  approval_gate: handleApprovalGate,
  publish: handlePublish,
  measure: handleMeasure,
  evaluate: handleEvaluate,
  recommend: handleRecommend,
};
