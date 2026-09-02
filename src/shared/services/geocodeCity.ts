import { AppError } from "@/shared/errors/AppError";

type GeocodingResult = {
  latitude?: number;
  longitude?: number;
  name?: string;
  country_code?: string;
  admin1?: string;
};

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

/** Resolve a cidade informada pelo usuário em coordenadas para o provedor de clima. */
export async function geocodeCity(city: string): Promise<{
  latitude: number;
  longitude: number;
  city: string;
}> {
  const query = city.trim();
  if (!query) throw new AppError("Informe a cidade do salão.", 422);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const url = new URL(GEOCODING_URL);
    url.searchParams.set("name", query);
    url.searchParams.set("count", "10");
    url.searchParams.set("language", "pt");
    url.searchParams.set("format", "json");

    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);

    const body = (await response.json()) as { results?: GeocodingResult[] };
    const results = body.results ?? [];
    const result =
      results.find((item) => item.country_code?.toUpperCase() === "BR") ?? results[0];

    if (
      !result ||
      typeof result.latitude !== "number" ||
      typeof result.longitude !== "number"
    ) {
      throw new AppError(
        `Não encontramos a cidade "${query}". Confira o nome e, se necessário, informe também o estado.`,
        422,
      );
    }

    return {
      latitude: result.latitude,
      longitude: result.longitude,
      city: result.name || query,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Não foi possível localizar essa cidade agora. Tente novamente em alguns instantes.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
