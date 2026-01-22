import { defineConfig } from "vitest/config";

export default defineConfig({
  // 👇 IMPORTANT: do NOT inherit Vite's root:"client"
  root: ".",

  test: {
    environment: "node",
    include: [
      "shared/**/*.{test,spec}.ts",
      "shared/**/__tests__/**/*.ts",
      "server/**/*.{test,spec}.ts",
      "server/**/__tests__/**/*.ts",
      "client/**/*.{test,spec}.ts",
      "client/**/__tests__/**/*.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
  },
});