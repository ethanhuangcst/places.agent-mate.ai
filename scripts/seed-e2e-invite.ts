/**
 * Seeds a pending admin invite for Playwright E2E. Prints JSON to stdout.
 * Usage: npx tsx --env-file=.env.local scripts/seed-e2e-invite.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db/client";
import { hashToken } from "../src/core/crypto";

const EMAIL = "e2e-invite@example.com";
const USERNAME = "e2einvite";
const PASSWORD = "e2einvitepass123";

async function main() {
  const token = randomUUID();
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.adminUser.create({
    data: {
      email: EMAIL,
      username: `pending-${token.slice(0, 8)}`,
      passwordHash: "",
      inviteTokenHash: hashToken(token),
      inviteTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  });
  process.stdout.write(
    JSON.stringify({ token, email: EMAIL, username: USERNAME, password: PASSWORD }),
  );
  await prisma.$disconnect();
}

void main();
