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
      js: "const { createRequire } = require('module'); const { fileURLToPath } = require('url'); const { dirname } = require('path');",
    };
  },
});