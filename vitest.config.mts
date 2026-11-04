import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Config enxuta para não estourar CPU/memória local:
 * pool forks (max 2), sem paralelismo de arquivos, reporters 'dot', mocks
 * restaurados por teste e coverage/css desligados por padrão.
 * Integração/containers rodam só via scripts dedicados (baixa concorrência).
 * Durante o desenvolvimento: `npm run test:changed` / `npm run test:related`
 * (suíte completa só no CI) — ver AGENTS.md.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["src/tests/setup.ts"],
    exclude: [
      "dist/**",
      "node_modules/**",
      "**/node_modules/**",
      ".opencode/**",
      // spikes/ocr-benchmark tem runner próprio (node:test via tsx, script
      // "test" do package.json do spike). Os arquivos .test.ts de lá são
      // executados como script — o vitest os importava, rodava as asserções
      // e falhava com "No test suite found in file".
      "spikes/**",
    ],
    pool: "forks",
    poolOptions: { forks: { maxForks: 2, minForks: 1 } },
    fileParallelism: false,
    maxWorkers: 2,
    css: false,
    clearMocks: true,
    restoreMocks: true,
    reporters: ["dot"],
    coverage: { enabled: false },
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
