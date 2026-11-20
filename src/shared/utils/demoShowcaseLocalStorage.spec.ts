import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_SHOWCASE_LOCAL_STORAGE_PORT,
  DemoShowcaseLocalDevStorage,
  serveDemoShowcaseLocalDevStorage,
  type DemoShowcaseLocalDevServer,
} from "./demoShowcaseLocalStorage";

describe("demoShowcaseLocalStorage", () => {
  let root: string;
  let server: DemoShowcaseLocalDevServer | null = null;
  // Porta de teste alta para não colidir com a porta fixa do seed.
  const port = 43190 + Math.floor(Math.random() * 1000);

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "demo-showcase-storage-"));
  });

  afterEach(async () => {
    if (server) await server.close().catch(() => undefined);
    server = null;
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  });

  it("expõe a constante de porta fixa usada nas URLs do seed", () => {
    expect(DEMO_SHOWCASE_LOCAL_STORAGE_PORT).toBe(4319);
  });

  it("grava no formato agendaja/{id}/{tipo}/{tipo} e devolve URL local", async () => {
    const storage = new DemoShowcaseLocalDevStorage(root, port);
    const result = await storage.uploadBuffer(
      "agendaja/shop-1/logo",
      "logo",
      Buffer.from([1, 2, 3, 4]),
      "image/webp",
      { publicId: "agendaja/shop-1/logo/logo" },
    );
    expect(result.objectName).toBe("agendaja/shop-1/logo/logo");
    expect(result.publicUrl).toBe(`http://127.0.0.1:${port}/agendaja/shop-1/logo/logo`);
    expect(result.size).toBe(4);
  });

  it("servidor responde HEAD 200 com content-type image/*", async () => {
    const storage = new DemoShowcaseLocalDevStorage(root, port);
    await storage.uploadBuffer(
      "agendaja/shop-1/cover",
      "cover",
      Buffer.from([9, 9, 9]),
      "image/webp",
      { publicId: "agendaja/shop-1/cover/cover" },
    );
    server = await serveDemoShowcaseLocalDevStorage(root, port);

    const response = await fetch(
      `http://127.0.0.1:${port}/agendaja/shop-1/cover/cover`,
      { method: "HEAD" },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^image\//u);
  });

  it("GET devolve os bytes originais", async () => {
    const storage = new DemoShowcaseLocalDevStorage(root, port);
    const payload = Buffer.from("demo-bytes");
    await storage.uploadBuffer(
      "agendaja/shop-2/logo",
      "logo",
      payload,
      "image/webp",
      { publicId: "agendaja/shop-2/logo/logo" },
    );
    server = await serveDemoShowcaseLocalDevStorage(root, port);

    const response = await fetch(`http://127.0.0.1:${port}/agendaja/shop-2/logo/logo`);
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.equals(payload)).toBe(true);
  });

  it("retorna 404 para objeto inexistente e 405 para método inválido", async () => {
    server = await serveDemoShowcaseLocalDevStorage(root, port);
    const missing = await fetch(`http://127.0.0.1:${port}/agendaja/nada/logo/logo`);
    expect(missing.status).toBe(404);
    const post = await fetch(`http://127.0.0.1:${port}/qualquer`, { method: "POST" });
    expect(post.status).toBe(405);
  });

  it("bloqueia path traversal fora da raiz", async () => {
    server = await serveDemoShowcaseLocalDevStorage(root, port);
    const response = await fetch(
      `http://127.0.0.1:${port}/${encodeURIComponent("../../etc/passwd")}`,
    );
    expect([403, 404]).toContain(response.status);
  });

  it("deleteObject remove o arquivo sem lançar erro se não existir", async () => {
    const storage = new DemoShowcaseLocalDevStorage(root, port);
    await storage.uploadBuffer(
      "agendaja/shop-3/logo",
      "logo",
      Buffer.from([1]),
      "image/webp",
      { publicId: "agendaja/shop-3/logo/logo" },
    );
    await storage.deleteObject("agendaja/shop-3/logo/logo");
    await storage.deleteObject("agendaja/shop-3/logo/logo"); // idempotente
    await expect(storage.deleteObject("agendaja/inexistente/logo/logo")).resolves.toBeUndefined();
  });

  it("extractObjectName aceita apenas URLs da própria porta", () => {
    const storage = new DemoShowcaseLocalDevStorage(root, port);
    expect(storage.extractObjectName(`http://127.0.0.1:${port}/agendaja/x/logo/logo.webp`)).toBe(
      "agendaja/x/logo/logo",
    );
    expect(storage.extractObjectName("https://res.cloudinary.com/x/image/upload/y")).toBeNull();
  });

  it("rejeita objectName que escape da raiz", async () => {
    const storage = new DemoShowcaseLocalDevStorage(root, port);
    await expect(storage.deleteObject("../../fora")).rejects.toThrow(/fora da raiz/u);
    await expect(
      storage.uploadBuffer("a", "b", Buffer.from([1]), "image/webp", {
        publicId: "../../fora/b",
      }),
    ).rejects.toThrow(/fora da raiz/u);
  });
});
