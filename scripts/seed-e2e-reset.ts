/**
 * Seeds an admin user and password-reset token for Playwright E2E. Prints JSON to stdout.
 * Usage: npx tsx --env-file=.env.local scripts/seed-e2e-reset.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/db/client";
import { hashPassword, hashToken } from "../src/core/crypto";

const EMAIL = "e2e-reset@example.com";
const USERNAME = "e2ereset";
const OLD_PASSWORD = "e2eoldpass123";
const NEW_PASSWORD = "e2enewpass123";

async function main() {
  const token = randomUUID();
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.adminUser.create({
    data: {
      email: EMAIL,
      username: USERNAME,
      passwordHash: await hashPassword(OLD_PASSWORD),
      resetTokenHash: hashToken(token),
      resetTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 4),
    },
  });
  process.stdout.write(
    JSON.stringify({
      token,
      email: EMAIL,
      username: USERNAME,
      oldPassword: OLD_PASSWORD,
      password: NEW_PASSWORD,
    }),
  );
  await prisma.$disconnect();
}

void main();
