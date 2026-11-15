/// <reference types="vitest/globals" />
import { classifyTrafficArea, normalizeTrafficPath } from "./trafficAreas";

describe("classificação das áreas de tráfego", () => {
  it("não conta o painel master", () => {
    expect(classifyTrafficArea("/master")).toBeNull();
    expect(classifyTrafficArea("/master/traffic")).toBeNull();
  });

  it("separa site público, páginas públicas de salão e área logada", () => {
    expect(classifyTrafficArea("/")).toBe("public_site");
    expect(classifyTrafficArea("/servicos")).toBe("public_site");
    expect(classifyTrafficArea("/s/salon/123")).toBe("salon_public");
    expect(classifyTrafficArea("/queue/123")).toBe("salon_public");
    expect(classifyTrafficArea("/agendamento/gerenciar")).toBe("salon_public");
    expect(classifyTrafficArea("/app/agenda")).toBe("logged_area");
    expect(classifyTrafficArea("/minha-conta")).toBe("logged_area");
  });

  it("remove query e fragmento antes de classificar", () => {
    expect(normalizeTrafficPath("/app/agenda?token=secret#section")).toBe("/app/agenda");
    expect(classifyTrafficArea("/master/traffic?manageToken=secret")).toBeNull();
    expect(normalizeTrafficPath("app/agenda")).toBe("/app/agenda");
  });
});
