import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/**/*.ts",
    "!src/**/*.spec.ts",
    "!src/**/*.test.ts",
    "!src/**/*.fixture.ts",
    "!src/tests/**",
    "!src/@types/**",
  ],
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
  async onSuccess() {
    const { copyFileSync, mkdirSync, existsSync, readdirSync } = await import("fs");
    const { join } = await import("path");
    const src = join("src", "modules", "posts", "fonts", "OpenSans-Bold.ttf");
    const destDir = join("dist", "modules", "posts", "fonts");
    if (existsSync(src)) {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(src, join(destDir, "OpenSans-Bold.ttf"));
    }
    const assetsDir = join("dist", "modules", "posts", "assets");
    mkdirSync(assetsDir, { recursive: true });
    const sourceAssetsDir = join("src", "modules", "posts", "assets");
    if (existsSync(sourceAssetsDir)) {
      for (const asset of readdirSync(sourceAssetsDir).filter((name) => name.endsWith(".png"))) {
        copyFileSync(join(sourceAssetsDir, asset), join(assetsDir, asset));
      }
    }
    // Motor de camadas (1.3): fontes TTF do satori + stocks JPEG do sharp.
    // O resvg usa loadSystemFonts:false e o satori lê do registry — os dois
    // resolvem por estes caminhos em dist/modules/posts/templates/assets.
    const templateAssets = join("src", "modules", "posts", "templates", "assets");
    if (existsSync(templateAssets)) {
      // Copy regular assets individually: recursive cpSync failed during the
      // Windows build before completing the font/stock directory.
      const copyAssets = (source: string, destination: string) => {
        mkdirSync(destination, { recursive: true });
        for (const entry of readdirSync(source, { withFileTypes: true })) {
          const from = join(source, entry.name);
          const to = join(destination, entry.name);
          if (entry.isDirectory()) copyAssets(from, to);
          else if (entry.isFile()) copyFileSync(from, to);
        }
      };
      copyAssets(templateAssets, join("dist", "modules", "posts", "templates", "assets"));
    }
  },
});
