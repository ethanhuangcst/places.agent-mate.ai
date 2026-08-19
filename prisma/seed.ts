import { prisma } from "../src/db/client";
import { hashPassword } from "../src/core/crypto";

async function main() {
  const password =
    process.env.DEV_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD || "";
  const passwordHash = password ? await hashPassword(password) : "";
  await prisma.adminUser.upsert({
    where: { username: "admin" },
    update: password ? { passwordHash } : {},
    create: {
      username: "admin",
      email: "me@ethanhuang.com",
      passwordHash,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
