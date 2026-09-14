import { AppError } from '@/shared/errors/AppError';
import { geocodeCity } from './geocodeCity';

type Location = { latitude: number; longitude: number };
const cache = new Map<string, { location?: Location; expiresAt: number }>();
const pending = new Map<string, Promise<Location>>();

/** Resolve cadastros antigos sem coordenadas, sem bloquear o painel nem alterar o cadastro. */
export async function resolveWeatherLocation(shop: { city?: string | null; latitude?: number | null; longitude?: number | null }): Promise<Location> {
  if (typeof shop.latitude === 'number' && Number.isFinite(shop.latitude) &&
      typeof shop.longitude === 'number' && Number.isFinite(shop.longitude)) {
    return { latitude: shop.latitude, longitude: shop.longitude };
  }
  const city = shop.city?.trim();
  if (!city) throw new AppError('Informe a cidade do salão nas configurações para ativar a previsão.', 400, undefined, 'WEATHER_LOCATION_MISSING');
  const key = city.toLocaleLowerCase('pt-BR');
  const unavailable = () => new AppError('Não foi possível consultar o clima da sua cidade agora. Tente novamente em alguns minutos.', 503, undefined, 'WEATHER_PROVIDER_UNAVAILABLE');
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.location) return cached.location;
    throw unavailable();
  }
  const existing = pending.get(key);
  if (existing) return existing;
  const request = geocodeCity(city).then(location => {
    if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
    cache.set(key, { location, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return location;
  }).catch(() => {
    cache.set(key, { expiresAt: Date.now() + 60_000 });
    throw unavailable();
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
