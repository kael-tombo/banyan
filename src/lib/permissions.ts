/**
 * Backend authorization rules for the agentic runtime.
 *
 * Pure functions on purpose: the routing layer calls them after resolving the
 * membership, and the unit tests exercise them without a database. All roles
 * below are Membership.role values stored server-side — never trusted from
 * the browser.
 *
 * Consequential actions (plan approval, content approval, publishing,
 * advancing a workflow, correcting business context) require write access.
 * Read-only members can inspect everything but cannot cause side effects.
 */

export type MembershipRole = "owner" | "member" | "viewer";

export const READ_ROLES: readonly string[] = ["owner", "member", "viewer"];
export const WRITE_ROLES: readonly string[] = ["owner", "member"];

export function canRead(role: string): boolean {
  return (READ_ROLES as readonly string[]).includes(role);
}

export function canWrite(role: string): boolean {
  return (WRITE_ROLES as readonly string[]).includes(role);
}

/** Approving a plan or content is a consequential, attributed action. */
export function canApprove(role: string): boolean {
  return canWrite(role);
}

/**
 * Retrying a failed/blocked task re-enters the execution path; gate it the
 * same way as any other write. Cancelling a workflow is also a write.
 */
export function canControlWorkflow(role: string): boolean {
  return canWrite(role);
}

/**
 * Unified guard used by API routes. Returns an error message when the role is
 * insufficient, or null when the action is allowed.
 */
export function requireRole(role: string, action: "read" | "write" | "approve" | "control"): string | null {
  switch (action) {
    case "read":
      return canRead(role) ? null : "Your workspace role does not grant read access.";
    case "write":
      return canWrite(role) ? null : "Your workspace role does not grant write access.";
    case "approve":
      return canApprove(role) ? null : "Only owners and members can record approvals.";
    case "control":
      return canControlWorkflow(role) ? null : "Only owners and members can control the workflow.";
  }
}
