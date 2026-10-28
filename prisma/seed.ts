import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedDemoDatabase } from "../src/lib/bootstrap/seed-demo";

/**
 * Seed script — `npm run db:seed` (also run by `npm run setup`).
 *
 * Thin wrapper around the shared demo seeding in
 * `src/lib/bootstrap/seed-demo.ts`, which is also used by the runtime
 * bootstrap on throwaway-filesystem (serverless) hosts. See that module for
 * what is created and the honesty guarantees (no fabricated results).
 */
const prisma = new PrismaClient();

seedDemoDatabase(prisma)
  .then(({ email }) => {
    console.log(`Sign in with ${email} / the SEED_USER_PASSWORD from your .env.`);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
