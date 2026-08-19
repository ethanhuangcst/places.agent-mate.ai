import { defineConfig } from "vitest/config";
import path from "node:path";

const testDb =
  process.env.TEST_DATABASE_URL ??
  "postgresql://places_agent:places_agent@localhost:5435/places_agent_test";

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
      PLACES_VENDOR_MODE: "fixture",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "src/adapters/**/fixture.ts",
        "src/adapters/fixtures.ts",
        "src/ui/**",
        "src/adapters/google/mcp-client.ts",
        "src/adapters/**/config.ts",
        "src/adapters/**/live.ts",
        "src/auth/admin.ts",
        "src/auth/session.ts",
        "src/auth/mail.ts",
        "src/agent/loop.ts",
      ],
      reporter: ["text", "json-summary"],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 80,
        "**/itinerary.ts": {
          statements: 90,
          lines: 90,
          functions: 90,
          branches: 80,
        },
        "**/itinerary-timed.ts": {
          statements: 90,
          lines: 90,
          functions: 95,
          branches: 75,
        },
        "**/place-filters.ts": { 100: true },
        "**/core/tools.ts": {
          statements: 85,
          lines: 90,
          functions: 100,
          branches: 75,
        },
        "**/amap/direct.ts": {
          statements: 95,
          lines: 100,
          functions: 90,
          branches: 80,
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
