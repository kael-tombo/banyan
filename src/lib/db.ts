import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "@/lib/db-url";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const resolved = resolveDatabaseUrl();
  // The generated client resolves its datasource via the literal env name
  // baked in at generate time (`url = env("DATABASE_URL")`). When the URL
  // arrives under a platform alias (PRISMA_DATABASE_URL / POSTGRES_URL),
  // pass it explicitly so the engine never depends on the variable name.
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(resolved.url ? { datasourceUrl: resolved.url } : {}),
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
