/// <reference types="vitest/globals" />
import type { FastifyRequest } from "fastify";
import {
  requestOrigin,
  resolvePublicApiUrl,
  resolvePublicAppUrl,
  shareEnvProductionWarnings,
} from "./shareUrls";

function fakeRequest(overrides: { protocol?: string; hostname?: string } = {}): FastifyRequest {
  return {
    protocol: overrides.protocol ?? "http",
    hostname: overrides.hostname ?? "localhost:8080",
  } as unknown as FastifyRequest;
}

const PROD = { NODE_ENV: "production" } as const;

describe("shareUrls", () => {
  describe("requestOrigin", () => {
    it("monta a origem com protocolo e hostname (já honrando trustProxy)", () => {
      expect(
        requestOrigin(fakeRequest({ protocol: "https", hostname: "agendai.example.com" })),
      ).toBe("https://agendai.example.com");
    });

    it("mantém a porta quando o host a traz", () => {
      expect(requestOrigin(fakeRequest({ hostname: "localhost:8080" }))).toBe(
        "http://localhost:8080",
      );
    });

    it("sem host cai para localhost:PORT", () => {
      expect(requestOrigin(fakeRequest({ hostname: "" }), { PORT: "3399" })).toBe(
        "http://localhost:3399",
      );
    });
  });

  describe("resolvePublicAppUrl", () => {
    it("usa PUBLIC_APP_URL sem barra final", () => {
      expect(
        resolvePublicAppUrl(fakeRequest(), { PUBLIC_APP_URL: "https://agendai.example.com/" }),
      ).toBe("https://agendai.example.com");
    });

    it("sem env cai na origem da requisição (dev/teste)", () => {
      expect(resolvePublicAppUrl(fakeRequest({ protocol: "https", hostname: "app.local" }), {})).toBe(
        "https://app.local",
      );
    });
  });

  describe("resolvePublicApiUrl (og:image sem capa)", () => {
    it("PUBLIC_API_URL vence em qualquer ambiente", () => {
      expect(
        resolvePublicApiUrl(fakeRequest(), {
          NODE_ENV: "production",
          PUBLIC_API_URL: "https://api.example.com/",
          PUBLIC_APP_URL: "https://app.example.com",
        }),
      ).toBe("https://api.example.com");
    });

    it("fora de produção, sem env, usa a origem da requisição", () => {
      expect(resolvePublicApiUrl(fakeRequest({ protocol: "https", hostname: "app.local" }), {})).toBe(
        "https://app.local",
      );
      expect(
        resolvePublicApiUrl(fakeRequest({ hostname: "app.local" }), { NODE_ENV: "test" }),
      ).toBe("http://app.local");
    });

    it("em produção, sem PUBLIC_API_URL, cai para PUBLIC_APP_URL (nunca a requisição)", () => {
      expect(
        resolvePublicApiUrl(fakeRequest({ hostname: "10.0.0.7:8080" }), {
          ...PROD,
          PUBLIC_APP_URL: "https://app.example.com",
        }),
      ).toBe("https://app.example.com");
    });

    it("em produção sem nenhuma env devolve base vazia (og:image omitido)", () => {
      expect(resolvePublicApiUrl(fakeRequest({ hostname: "10.0.0.7:8080" }), PROD)).toBe("");
      expect(
        resolvePublicApiUrl(fakeRequest({ hostname: "10.0.0.7:8080" }), {
          ...PROD,
          PUBLIC_APP_URL: "   ",
        }),
      ).toBe("");
    });
  });

  describe("shareEnvProductionWarnings", () => {
    it("não avisa fora de produção", () => {
      expect(shareEnvProductionWarnings({})).toEqual([]);
      expect(shareEnvProductionWarnings({ NODE_ENV: "test" })).toEqual([]);
      expect(shareEnvProductionWarnings({ NODE_ENV: "development" })).toEqual([]);
    });

    it("avisa quando faltam as duas envs em produção", () => {
      const warnings = shareEnvProductionWarnings(PROD);

      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain("PUBLIC_APP_URL ausente em produção");
      expect(warnings[1]).toContain("PUBLIC_API_URL ausente em produção");
    });

    it("avisa só de PUBLIC_API_URL quando só ela falta", () => {
      const warnings = shareEnvProductionWarnings({ ...PROD, PUBLIC_APP_URL: "https://app.example.com" });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("PUBLIC_API_URL ausente em produção");
    });

    it("não avisa com as duas envs configuradas", () => {
      expect(
        shareEnvProductionWarnings({
          ...PROD,
          PUBLIC_APP_URL: "https://app.example.com",
          PUBLIC_API_URL: "https://api.example.com",
        }),
      ).toEqual([]);
    });
  });
});
