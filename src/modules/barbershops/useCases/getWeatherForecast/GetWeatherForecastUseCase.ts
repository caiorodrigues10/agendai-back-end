import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IWeatherProvider } from "@/shared/container/providers/WeatherProvider/IWeatherProvider";
import { resolveWeatherLocation } from '@/shared/services/resolveWeatherLocation';

type RequestingUser = { role: string; barbershopId?: string };

@injectable()
export class GetWeatherForecastUseCase {
  constructor(
    @inject("BarbershopRepository")
    private barbershopRepository: IBarbershopRepository,
    @inject("WeatherProvider")
    private weatherProvider: IWeatherProvider
  ) {}

  async execute(barbershopId: string, user: RequestingUser, days = 7) {
    if (user.role !== "MASTER_ADMIN" && user.barbershopId !== barbershopId) {
      throw new AppError("Acesso negado", 403);
    }

    const shop = await this.barbershopRepository.findById(barbershopId);
    if (!shop) throw new AppError("Salão não encontrado", 404);
    const location = await resolveWeatherLocation(shop);

    const forecast = await this.weatherProvider.getForecast(
      location.latitude,
      location.longitude,
      Math.min(Math.max(days, 1), 16)
    ).catch(() => { throw new AppError('Previsão do tempo temporariamente indisponível. Tente novamente em alguns minutos.', 503, undefined, 'WEATHER_PROVIDER_UNAVAILABLE'); });

    return {
      city: shop.city ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      forecast,
    };
  }
}
