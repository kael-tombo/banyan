/** Cookie options for the active-product preference (validated server side on every request; ADR-005). */
export function activeProductCookie() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };
}
