import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The job queue (BullMQ on Redis) runs in Node; let Node load it instead of bundling it. Bundling
  // tried to resolve BullMQ's optional Valkey client (@valkey/valkey-glide), which this app does not
  // use, and warned "Module not found" on every compile.
  serverExternalPackages: ["bullmq", "ioredis"],
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
