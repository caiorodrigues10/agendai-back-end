import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/tests/setup.ts"],
    exclude: ["dist/**", "node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
