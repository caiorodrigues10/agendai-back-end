import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeCity } from "./geocodeCity";

describe("geocodeCity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("converte a cidade em coordenadas e prioriza resultados do Brasil", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { name: "São Paulo", latitude: -23.55, longitude: -46.63, country_code: "BR" },
          { name: "Sao Paulo", latitude: 40.7, longitude: -74, country_code: "US" },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(geocodeCity("São Paulo")).resolves.toEqual({
      city: "São Paulo",
      latitude: -23.55,
      longitude: -46.63,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retorna erro amigável quando a cidade não é encontrada", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

    await expect(geocodeCity("Cidade inexistente")).rejects.toMatchObject({
      statusCode: 422,
    });
  });
});
