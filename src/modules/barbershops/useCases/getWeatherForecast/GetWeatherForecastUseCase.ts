import { inject, injectable } from "tsyringe";
import { AppError } from "@/shared/errors/AppError";
import { IBarbershopRepository } from "../../repositories/IBarbershopRepository";
import { IWeatherProvider } from "@/shared/container/providers/WeatherProvider/IWeatherProvider";

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
    if (shop.latitude == null || shop.longitude == null) {
      throw new AppError("Informe a cidade do salão para ver a previsão do tempo.", 400);
    }

    const forecast = await this.weatherProvider.getForecast(
      shop.latitude,
      shop.longitude,
      Math.min(Math.max(days, 1), 16)
    );

    return {
      city: shop.city ?? null,
      latitude: shop.latitude,
      longitude: shop.longitude,
      forecast,
    };
  }
}
