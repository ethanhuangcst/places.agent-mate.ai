import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync(".data", { recursive: true });
execSync("npx prisma migrate deploy", {
  stdio: "pipe",
  env: process.env,
});
