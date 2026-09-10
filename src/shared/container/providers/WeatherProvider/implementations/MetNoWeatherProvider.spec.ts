import { describe, expect, it } from 'vitest';
import { parseMetNoForecast } from './MetNoWeatherProvider';

describe('parseMetNoForecast', () => {
  it('converte a série horária em cards diários', () => {
    const result = parseMetNoForecast([
      {
        time: '2026-09-11T09:00:00Z',
        data: {
          instant: { details: { air_temperature: 21, relative_humidity: 72, wind_speed: 2 } },
          next_1_hours: {
            summary: { symbol_code: 'partlycloudy_day' },
            details: { precipitation_amount: 0, probability_of_precipitation: 10 },
          },
        },
      },
      {
        time: '2026-09-11T15:00:00Z',
        data: {
          instant: { details: { air_temperature: 30, relative_humidity: 48, wind_speed: 4 } },
          next_1_hours: {
            summary: { symbol_code: 'rainshowers_day' },
            details: { precipitation_amount: 1.2, probability_of_precipitation: 65 },
          },
        },
      },
    ], 7);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      date: '2026-09-11',
      tempMin: 21,
      tempMax: 30,
      precipMm: 1.2,
      precipProbability: 65,
    });
  });
});
