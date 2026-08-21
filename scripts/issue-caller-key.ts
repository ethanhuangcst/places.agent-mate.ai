/**
 * Issue a caller API key for MCP/HTTP testing. Prints JSON { secret, prefix } to stdout.
 * Usage: npx tsx --env-file=.env.local scripts/issue-caller-key.ts [name]
 */
import { prisma } from "../src/db/client";
import { generateCallerSecret } from "../src/core/crypto";

const name = process.argv[2] ?? "chatbox-dev";

async function main() {
  const generated = generateCallerSecret();
  await prisma.callerApiKey.create({
    data: {
      name,
      keyHash: generated.keyHash,
      prefix: generated.prefix,
      secret: generated.secret,
      status: "ACTIVE",
    },
  });
  process.stdout.write(
    JSON.stringify({ name, secret: generated.secret, prefix: generated.prefix }),
  );
  await prisma.$disconnect();
}

void main();
