import "dotenv/config";

/**
 * Unit tests exercise pure domain logic only — never the network or the
 * database. Real .env values are used when present (loaded by dotenv), and
 * deterministic safe defaults fill any gaps so tests run in CI without secrets.
 */
const env = process.env as Record<string, string | undefined>;
env.DATABASE_URL ||= "file:./prisma/dev.db";
env.APP_SECRET ||= "0123456789abcdef".repeat(4); // 64 hex chars = 32 bytes
env.NODE_ENV = "test";
