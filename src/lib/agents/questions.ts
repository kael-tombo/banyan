/**
 * A question an agent asked the founder (R4). It lives in the blocked task's output, with the run whose
 * session the answer continues, until it is answered.
 */

/** The question an agent left on a blocked task, if it is still unanswered. */
export function openQuestion(output: string | null): { question: string; runId: string; data: Record<string, unknown> } | null {
  try {
    const parsed = JSON.parse(output ?? "null") as { data?: Record<string, unknown> } | null;
    const data = parsed?.data;
    if (data && typeof data.question === "string" && typeof data.runId === "string" && data.answer === undefined) {
      return { question: data.question, runId: data.runId, data };
    }
  } catch {
    /* not an agent question */
  }
  return null;
}
