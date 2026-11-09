import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { assertAllowedUrl, loadProcessedPhoto, PhotoError } from "./image";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/redirect-host-fora") {
      res.writeHead(302, { location: "https://evil.example.com/x.jpg" });
      res.end();
      return;
    }
    if (req.url === "/redirect-relativo") {
      res.writeHead(302, { location: "/ok.png" });
      res.end();
      return;
    }
    if (req.url === "/ok.png") {
      res.writeHead(200, { "content-type": "image/png", "content-length": String(PNG_1X1.length) });
      res.end(PNG_1X1);
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertAllowedUrl — allowlist", () => {
  it("aceita data-URI e rejeita host/protocolo fora da allowlist", () => {
    expect(() => assertAllowedUrl("data:image/png;base64,AAAA")).not.toThrow();
    expect(() => assertAllowedUrl("https://evil.example.com/a.jpg")).toThrow(PhotoError);
    expect(() => assertAllowedUrl("file:///etc/passwd")).toThrow(/Protocolo/);
    expect(() => assertAllowedUrl("não é url")).toThrow(/inválida/);
  });

  it("aceita só o cloudinary do projeto (CLOUDINARY_CLOUD_NAME)", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "meu-cloud");
    expect(() => assertAllowedUrl("https://res.cloudinary.com/meu-cloud/image/upload/v1/x.png")).not.toThrow();
    expect(() => assertAllowedUrl("https://res.cloudinary.com/outro-cloud/image/upload/x.png")).toThrow(
      /Cloudinary de outro projeto: outro-cloud/
    );
    expect(() => assertAllowedUrl("http://res.cloudinary.com/meu-cloud/x.png")).toThrow(/exige https/);
  });

  it("sem CLOUDINARY_CLOUD_NAME nenhum URL do cloudinary é aceito", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "");
    expect(() => assertAllowedUrl("https://res.cloudinary.com/meu-cloud/x.png")).toThrow(/não configurado/);
  });

  it("loopback é SSRF: liberado fora de produção, bloqueado em production", () => {
    expect(() => assertAllowedUrl("http://127.0.0.1:3000/a.jpg")).not.toThrow(); // NODE_ENV de teste
    expect(() => assertAllowedUrl("http://localhost:3000/a.jpg")).not.toThrow();

    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertAllowedUrl("http://127.0.0.1:3000/a.jpg")).toThrow(
      /loopback liberado só fora de produção/
    );
    expect(() => assertAllowedUrl("http://localhost/a.jpg")).toThrow(/loopback liberado só fora de produção/);

    // Regra dura: nenhuma flag (nem a antiga POST_IMAGE_ALLOW_LOOPBACK)
    // reabre loopback em produção.
    vi.stubEnv("POST_IMAGE_ALLOW_LOOPBACK", "1");
    expect(() => assertAllowedUrl("http://127.0.0.1:3000/a.jpg")).toThrow(
      /loopback liberado só fora de produção/
    );
  });

  it("em production o fetch de loopback é recusado (sem tocar a rede)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(loadProcessedPhoto(`${base}/redirect-relativo`)).rejects.toThrow(
      /loopback liberado só fora de produção/
    );
  });
});

describe("fetch com redirecionamento", () => {
  it("segue redirect relativo dentro da allowlist", async () => {
    const jpeg = await loadProcessedPhoto(`${base}/redirect-relativo`);
    expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("rejeita redirect para host fora da allowlist antes de buscar o destino", async () => {
    await expect(loadProcessedPhoto(`${base}/redirect-host-fora`)).rejects.toThrow(
      /Host de imagem não permitido: evil\.example\.com/
    );
  });

  it("rejeita resposta que não é imagem", async () => {
    await expect(loadProcessedPhoto("http://127.0.0.1:1/x.png")).rejects.toThrow(PhotoError);
  });
});
