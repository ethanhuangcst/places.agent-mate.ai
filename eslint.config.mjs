import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import babelParser from "@babel/eslint-parser";

const nextRules = {
  ...nextPlugin.configs.recommended.rules,
  ...nextPlugin.configs["core-web-vitals"].rules,
};

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
  },
  {
    files: ["**/*.{ts,tsx,jsx}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: [
            "@babel/preset-typescript",
            ["@babel/preset-react", { runtime: "automatic" }],
          ],
        },
      },
    },
    plugins: { "@next/next": nextPlugin },
    rules: nextRules,
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "node_modules/**",
    "agent-specs/**",
    "e2e/**",
    "coverage/**",
    "scripts/run-tc-c07.ts",
    "scripts/run-tc-c08.ts",
  ]),
]);
