export interface DailyForecast {
  date: string;
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  precipMm: number;
  precipProbability: number;
  precipHours: number;
  windSpeedMax: number;
  humidity: number;
  condition: string;
  conditionIcon: string;
}

export interface IWeatherProvider {
  getForecast(latitude: number, longitude: number, days?: number): Promise<DailyForecast[]>;
}
