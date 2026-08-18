import { defineConfig } from "vitest/config";
import path from "node:path";

const testDb = `file:${path.resolve(__dirname, ".data/places-agent-test.db")}`;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
    env: {
      SESSION_SECRET: "test-session-secret-32chars-minimum",
      DATABASE_URL: testDb,
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
