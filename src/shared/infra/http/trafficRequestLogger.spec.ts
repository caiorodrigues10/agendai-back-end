/// <reference types="vitest/globals" />
import { trafficRequestSerializer } from "./trafficRequestLogger";

describe("redação do log de requisição do beacon", () => {
  it("não expõe URL, host, IP ou porta do beacon", () => {
    const serialized = trafficRequestSerializer({
      method: "POST",
      url: "/api/ping?token=secret",
      headers: { "accept-version": "1.0", authorization: "Bearer secret" },
      host: "api.example.com",
      ip: "203.0.113.10",
      socket: { remotePort: 43123 },
    });

    expect(serialized).toEqual({ method: "POST" });
    expect(JSON.stringify(serialized)).not.toContain("203.0.113.10");
    expect(JSON.stringify(serialized)).not.toContain("43123");
    expect(JSON.stringify(serialized)).not.toContain("secret");
  });

  it("preserva os metadados normais das outras rotas", () => {
    const serialized = trafficRequestSerializer({
      method: "GET",
      url: "/api/admin/traffic",
      headers: { "accept-version": "1.0" },
      host: "api.example.com",
      ip: "203.0.113.10",
      socket: { remotePort: 43123 },
    });

    expect(serialized).toMatchObject({
      method: "GET",
      url: "/api/admin/traffic",
      host: "api.example.com",
      remoteAddress: "203.0.113.10",
      remotePort: 43123,
    });
  });
});
