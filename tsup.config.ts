import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/**/*.ts"],
  outDir: "dist",
  format: ["cjs"],
  target: "es2022",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  external: [
    "@prisma/client",
    "ssh2",
    "dockerode",
    "docker-modem",
    "ssh-remote-port-forward",
    "testcontainers",
    "dockerode",
  ],
  esbuildOptions: (options) => {
    options.banner = {
      js: "import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import { dirname } from 'path'; const require = createRequire(import.meta.url); const __filename = fileURLToPath(import.meta.url); const __dirname = dirname(__filename);",
    };
  },
});