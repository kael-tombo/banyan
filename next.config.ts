import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The job queue (BullMQ on Redis) runs in Node; let Node load it instead of bundling it. Bundling
  // tried to resolve BullMQ's optional Valkey client (@valkey/valkey-glide), which this app does not
  // use, and warned "Module not found" on every compile.
  // The embedded OpenCode host (R2) is loaded by Node at runtime, only on Node 24 and only when
  // AGENT_RUNTIME=opencode; it must never be bundled. (Not "effect": Next already transpiles it, and
  // listing it here is a build error. The host imports both by a name the bundler ignores.)
  serverExternalPackages: ["bullmq", "ioredis", "@opencode/sdk"],
  // BOS-065: security headers on every response (framing and HSTS in production only; see the module).
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV === "production") }];
  },
  // Serverless hosts trace files per-route; the Prisma query engine is a
  // native binary loaded at runtime from node_modules and is a known tracing
  // blind spot — if it is not bundled the function 500s with "Query engine
  // library not found" only in production. Include both client packages
  // explicitly for every API route.
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/.prisma/client/**/*", "./node_modules/@prisma/client/**/*"],
  },
};

export default nextConfig;
