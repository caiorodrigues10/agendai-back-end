import { RandomForest } from './RandomForest';
import { SeasonalDecomposition } from './SeasonalDecomposition';
import { RidgeRegression } from './RidgeRegression';
import { mean, std } from './StatisticsUtils';

export interface WeatherDataPoint {
  date: string;
  queueCount: number;
  appointmentCount: number;
  revenue?: number;
  precipMm: number;
  precipPct: number;
  tempMax: number;
  tempMin: number;
  windSpeedMax: number;
  humidity: number;
  weatherCode: number;
}

export interface WeatherForecastPoint {
  date: string;
  precipMm: number;
  precipPct: number;
  tempMax: number;
  tempMin: number;
  windSpeedMax: number;
  humidity: number;
  weatherCode: number;
  condition: string;
}

export interface DemandPrediction {
  date: string;
  condition: string;
  predictedQueue: number;
  confidenceLow: number;
  confidenceHigh: number;
  baselineAvg: number;
  dropPct: number;
  topFactors: Array<{ feature: string; impact: number }>;
  recommendation: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

const FEATURE_NAMES = [
  'precipMm', 'precipPct', 'tempMax', 'tempMin',
  'windSpeedMax', 'humidity', 'dayOfWeek', 'month',
  'isWeekend', 'weatherCode',
];

const RECOMMENDATIONS = {
  low: 'Dia normal. Mantenha operação padrão.',
  medium: 'Possível queda leve. Considere reforçar lembretes por WhatsApp.',
  high: 'Expectativa de queda significativa. Reduza equipe se possível e envie confirmações.',
  critical: 'Dia de baixa movimentação. Considere reduzir equipe e fazer promoções relâmpago.',
};

export class DemandPredictor {
  private seasonal = new SeasonalDecomposition();
  private randomForest: RandomForest;
  private ridge: RidgeRegression;
  private baselineAvg: number = 0;
  private residualStd: number = 1;
  private trained: boolean = false;

  constructor() {
    this.randomForest = new RandomForest(8, 3);
    this.ridge = new RidgeRegression();
  }

  train(data: WeatherDataPoint[]): void {
    if (data.length < 14) return;

    // Sort by date
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));

    // Seasonal decomposition
    this.seasonal.fit(sorted.map(d => d.date), sorted.map(d => d.queueCount));

    // Compute baseline (seasonal-adjusted)
    const baselines = sorted.map((d, i) => {
      const { baseline } = this.seasonal.predict(d.date, i, sorted.length);
      return baseline;
    });

    // Residuals = actual - baseline
    const residuals = sorted.map((d, i) => d.queueCount - baselines[i]);
    this.residualStd = std(residuals) || 1;
    this.baselineAvg = mean(sorted.map(d => d.queueCount));

    // Build feature matrix for residuals
    const X = sorted.map(d => this.extractFeatures(d));
    const y = residuals;

    // Train both models
    this.randomForest.fit(X, y, 50);
    this.ridge.fit(X, y, 1.0);

    this.trained = true;
  }

  predict(forecast: WeatherForecastPoint[], totalHistoryDays: number): DemandPrediction[] {
    if (!this.trained || forecast.length === 0) {
      return forecast.map(f => ({
        date: f.date,
        condition: f.condition,
        predictedQueue: Math.round(this.baselineAvg),
        confidenceLow: Math.max(0, Math.round(this.baselineAvg - 1.96 * this.residualStd)),
        confidenceHigh: Math.round(this.baselineAvg + 1.96 * this.residualStd),
        baselineAvg: Math.round(this.baselineAvg),
        dropPct: 0,
        topFactors: [],
        recommendation: RECOMMENDATIONS.low,
        riskLevel: 'low' as const,
      }));
    }

    return forecast.map((f, i) => {
      const features = this.extractFeaturesFromForecast(f);
      const rfResidual = this.randomForest.predict(features);
      const ridgeResidual = this.ridge.predict(features);

      // Ensemble: 70% RF + 30% Ridge
      const residualPred = rfResidual * 0.7 + ridgeResidual * 0.3;
      const { baseline, lower, upper } = this.seasonal.predict(f.date, totalHistoryDays + i, totalHistoryDays + forecast.length);

      const predicted = Math.max(0, Math.round(baseline + residualPred));
      const ciLow = Math.max(0, Math.round(baseline + lower - 1.96 * this.residualStd));
      const ciHigh = Math.round(baseline + upper + 1.96 * this.residualStd);

      const dropPct = this.baselineAvg > 0
        ? Math.round(((predicted - this.baselineAvg) / this.baselineAvg) * 100)
        : 0;

      // Feature importance
      const rfImportance = this.randomForest.getFeatureImportance();
      const topFactors = FEATURE_NAMES
        .map((name, idx) => ({ feature: name, impact: rfImportance[idx] || 0 }))
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 3);

      // Risk level
      let riskLevel: DemandPrediction['riskLevel'] = 'low';
      if (dropPct <= -35) riskLevel = 'critical';
      else if (dropPct <= -20) riskLevel = 'high';
      else if (dropPct <= -10) riskLevel = 'medium';

      // Recommendation
      let recommendation = RECOMMENDATIONS[riskLevel];
      if (f.precipPct > 70) {
        recommendation += ` Chuva com ${f.precipPct}% de probabilidade.`;
      }

      return {
        date: f.date,
        condition: f.condition,
        predictedQueue: predicted,
        confidenceLow: ciLow,
        confidenceHigh: ciHigh,
        baselineAvg: Math.round(this.baselineAvg),
        dropPct,
        topFactors,
        recommendation,
        riskLevel,
      };
    });
  }

  private extractFeatures(d: WeatherDataPoint): number[] {
    const date = new Date(d.date);
    return [
      d.precipMm,
      d.precipPct,
      d.tempMax,
      d.tempMin,
      d.windSpeedMax,
      d.humidity,
      date.getDay(),
      date.getMonth(),
      date.getDay() === 0 || date.getDay() === 6 ? 1 : 0,
      d.weatherCode,
    ];
  }

  private extractFeaturesFromForecast(f: WeatherForecastPoint): number[] {
    const date = new Date(f.date);
    return [
      f.precipMm,
      f.precipPct,
      f.tempMax,
      f.tempMin,
      f.windSpeedMax,
      f.humidity,
      date.getDay(),
      date.getMonth(),
      date.getDay() === 0 || date.getDay() === 6 ? 1 : 0,
      f.weatherCode,
    ];
  }

  isTrained(): boolean {
    return this.trained;
  }

  serialize(): object {
    return {
      seasonal: {
        trend: this.seasonal.trend,
        weeklyPattern: this.seasonal.weeklyPattern,
        yearlyPattern: this.seasonal.yearlyPattern,
        residualStd: this.seasonal.residualStd,
      },
      randomForest: this.randomForest.serialize(),
      baselineAvg: this.baselineAvg,
      residualStd: this.residualStd,
    };
  }

  static deserialize(data: any): DemandPredictor {
    const p = new DemandPredictor();
    p.seasonal.trend = data.seasonal.trend;
    p.seasonal.weeklyPattern = data.seasonal.weeklyPattern;
    p.seasonal.yearlyPattern = data.seasonal.yearlyPattern;
    p.seasonal.residualStd = data.seasonal.residualStd;
    p.randomForest = RandomForest.deserialize(data.randomForest);
    p.baselineAvg = data.baselineAvg;
    p.residualStd = data.residualStd;
    p.trained = true;
    return p;
  }
}
