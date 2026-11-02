/**
 * Operator credit grant (blocker 11, interim until payments exist).
 *
 *   npm run credits:grant -- <product-slug-or-id> <amount> "<reason>"
 *
 * Writes one "grant" entry to the product's credit ledger, with the reason and
 * the operator's OS user, so every credit is traceable. Running the same
 * command twice on the same day with the same reason grants once.
 */
import os from "node:os";
import { prisma } from "@/lib/db";
import { grantCredits } from "@/lib/credits/service";

export function parseGrantArgs(argv: string[]): { target: string; amount: number; reason: string } | { error: string } {
  const [target, rawAmount, ...rest] = argv;
  const reason = rest.join(" ").trim();
  const amount = Number(rawAmount);
  if (!target || !rawAmount || !reason) return { error: 'usage: npm run credits:grant -- <product-slug-or-id> <amount> "<reason>"' };
  if (!Number.isInteger(amount) || amount <= 0 || amount > 10_000) return { error: "amount must be a whole number between 1 and 10000" };
  if (reason.length < 4) return { error: "give a real reason (it is stored on the ledger)" };
  return { target, amount, reason };
}

async function main() {
  const args = parseGrantArgs(process.argv.slice(2));
  if ("error" in args) {
    console.error(args.error);
    process.exitCode = 2;
    return;
  }
  const product = await prisma.workspace.findFirst({ where: { OR: [{ id: args.target }, { slug: args.target }] }, select: { id: true, name: true, slug: true } });
  if (!product) {
    console.error(`No product with id or slug "${args.target}".`);
    process.exitCode = 1;
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `operator-grant:${day}:${args.amount}:${args.reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}`;
  const balance = await grantCredits(product.id, args.amount, key, `Operator grant by ${os.userInfo().username}: ${args.reason}`);
  console.log(`Granted ${args.amount} credits to ${product.name} (${product.slug}). Balance: ${JSON.stringify(balance)}`);
}

if (process.argv[1]?.includes("credits-grant")) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
