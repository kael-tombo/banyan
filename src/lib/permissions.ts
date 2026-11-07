/**
 * Backend authorization rules — product roles (BOS-010, ADR-005).
 *
 * Pure functions on purpose: routes call them after resolving the active
 * product's membership, and unit tests exercise them without a database.
 * Roles are Membership.role values stored server side — never trusted from
 * the browser. Organization roles (OWNER/ADMIN/…) live in organizations.ts and
 * are composed by products.ts: org OWNER/ADMIN act as PRODUCT_ADMIN.
 *
 * Capabilities:
 *   read    — see everything in the product
 *   write   — create and edit drafts, profile, campaigns
 *   approve — record approvals (strategy, content, plans) and set the autonomy mandate
 *   control — run, retry, distribute, publish
 *   manage  — product settings, connections, members
 */

export const PRODUCT_ROLES = ["PRODUCT_ADMIN", "MARKETING_MANAGER", "CONTENT_EDITOR", "ANALYST", "VIEWER"] as const;
export type ProductRole = (typeof PRODUCT_ROLES)[number];
export type Capability = "read" | "write" | "approve" | "control" | "manage";

/** Roles stored before BOS-010, mapped so nobody's rights change. */
const LEGACY: Record<string, ProductRole> = { owner: "PRODUCT_ADMIN", member: "MARKETING_MANAGER", viewer: "VIEWER" };

const CAPABILITIES: Record<ProductRole, readonly Capability[]> = {
  PRODUCT_ADMIN: ["read", "write", "approve", "control", "manage"],
  MARKETING_MANAGER: ["read", "write", "approve", "control"],
  CONTENT_EDITOR: ["read", "write"],
  ANALYST: ["read"],
  VIEWER: ["read"],
};

export const PRODUCT_ROLE_LABEL: Record<ProductRole, string> = {
  PRODUCT_ADMIN: "Product admin",
  MARKETING_MANAGER: "Marketing manager",
  CONTENT_EDITOR: "Content editor",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

/** The product role behind a stored value, or null for anything unknown (which grants nothing). */
export function productRole(role: string | null | undefined): ProductRole | null {
  if (!role) return null;
  if ((PRODUCT_ROLES as readonly string[]).includes(role)) return role as ProductRole;
  return LEGACY[role] ?? null;
}

export function can(role: string | null | undefined, capability: Capability): boolean {
  const r = productRole(role);
  return r !== null && CAPABILITIES[r].includes(capability);
}

export const canRead = (role: string) => can(role, "read");
export const canWrite = (role: string) => can(role, "write");
/** Approving a plan or content is a consequential, attributed action. */
export const canApprove = (role: string) => can(role, "approve");
/** Running, retrying, distributing and publishing re-enter the execution path. */
export const canControlWorkflow = (role: string) => can(role, "control");
export const canManage = (role: string) => can(role, "manage");

const DENIED: Record<Capability, string> = {
  read: "Your role in this product does not grant read access.",
  write: "Your role in this product does not grant write access.",
  approve: "Only product admins and marketing managers can record approvals.",
  control: "Only product admins and marketing managers can run or publish.",
  manage: "Only product admins can change this product's settings and connections.",
};

/** Unified guard used by API routes: an error message when the role is insufficient, else null. */
export function requireRole(role: string, action: Capability): string | null {
  return can(role, action) ? null : DENIED[action];
}
