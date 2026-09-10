import { afterEach, describe, expect, it } from "vitest";
import { getAuthCookieSecurityOptions } from "./authCookieOptions";

const originalNodeEnv = process.env.NODE_ENV;
const originalSameSite = process.env.AUTH_COOKIE_SAME_SITE;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalSameSite === undefined) delete process.env.AUTH_COOKIE_SAME_SITE;
  else process.env.AUTH_COOKIE_SAME_SITE = originalSameSite;
});

describe("getAuthCookieSecurityOptions", () => {
  it("usa cookie cross-site seguro e particionado por padrão em produção", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AUTH_COOKIE_SAME_SITE;

    expect(getAuthCookieSecurityOptions()).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
      path: "/api/auth",
    });
  });

  it("mantém SameSite=Lax em desenvolvimento", () => {
    process.env.NODE_ENV = "development";
    delete process.env.AUTH_COOKIE_SAME_SITE;

    expect(getAuthCookieSecurityOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      partitioned: false,
      path: "/api/auth",
    });
  });

  it("respeita configuração explícita", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_COOKIE_SAME_SITE = "strict";

    expect(getAuthCookieSecurityOptions()).toMatchObject({
      secure: true,
      sameSite: "strict",
      partitioned: false,
    });
  });
});
