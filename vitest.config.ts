import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      pgbeam: path.resolve(__dirname, "../sdk/src/index.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
