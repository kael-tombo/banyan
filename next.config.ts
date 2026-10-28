import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
