import { RandomForest } from './RandomForest';
import { SeasonalDecomposition } from './SeasonalDecomposition';
import { RidgeRegression } from './RidgeRegression';
import { mean, std } from './StatisticsUtils';

export type MaturityLevel = 'insufficient' | 'preliminary' | 'trained';

export function classifyMaturity(dataDays: number): MaturityLevel {
  if (dataDays < 30) return 'insufficient';
  if (dataDays < 90) return 'preliminary';
  return 'trained';
}

export function walkForwardBacktest(
  data: WeatherDataPoint[],
  validationWindowSize: number = 14,
): { mae: number; mape: number; residuals: number[] } {
  if (data.length < validationWindowSize + 14) {
    return { mae: Infinity, mape: Infinity, residuals: [] };
  }

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const residuals: number[] = [];
  const startIdx = sorted.length - validationWindowSize;

  for (let i = startIdx; i < sorted.length; i++) {
    const trainData = sorted.slice(0, i);
    const actual = sorted[i].queueCount;

    const recent = trainData.slice(-7);
    const predicted = recent.reduce((s, d) => s + d.queueCount, 0) / recent.length;

    const residual = actual - predicted;
    residuals.push(residual);
  }

  const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / residuals.length;
  const mape =
    (residuals.reduce((s, r, i) => {
      const actual = sorted[startIdx + i].queueCount;
      return s + (actual > 0 ? Math.abs(r) / actual : 0);
    }, 0) /
      residuals.length) *
    100;

  return { mae, mape, residuals };
}

export function confidenceInterval(
  predicted: number,
  residuals: number[],
  confidenceLevel: number = 0.8,
): [number, number] {
  if (residuals.length === 0) return [predicted * 0.7, predicted * 1.3];

  const sorted = residuals.map(Math.abs).sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * confidenceLevel);
  const margin = sorted[idx] || sorted[sorted.length - 1];

  return [Math.max(0, predicted - margin), predicted + margin];
}

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
  private backtestResiduals: number[] = [];

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

  runBacktest(data: WeatherDataPoint[]): { mae: number; mape: number; residuals: number[] } {
    const result = walkForwardBacktest(data);
    this.backtestResiduals = result.residuals;
    return result;
  }

  predict(forecast: WeatherForecastPoint[], totalHistoryDays: number): DemandPrediction[] {
    if (!this.trained || forecast.length === 0) {
      return forecast.map(f => {
        const predicted = Math.round(this.baselineAvg);
        const [confidenceLow, confidenceHigh] = confidenceInterval(predicted, this.backtestResiduals);
        return {
          date: f.date,
          condition: f.condition,
          predictedQueue: predicted,
          confidenceLow: Math.round(confidenceLow),
          confidenceHigh: Math.round(confidenceHigh),
          baselineAvg: Math.round(this.baselineAvg),
          dropPct: 0,
          topFactors: [],
          recommendation: RECOMMENDATIONS.low,
          riskLevel: 'low' as const,
        };
      });
    }

    return forecast.map((f, i) => {
      const features = this.extractFeaturesFromForecast(f);
      const rfResidual = this.randomForest.predict(features);
      const ridgeResidual = this.ridge.predict(features);

      // Ensemble: 70% RF + 30% Ridge
      const residualPred = rfResidual * 0.7 + ridgeResidual * 0.3;
      const { baseline, lower, upper } = this.seasonal.predict(f.date, totalHistoryDays + i, totalHistoryDays + forecast.length);

      const predicted = Math.max(0, Math.round(baseline + residualPred));
      const [rawLow, rawHigh] = confidenceInterval(predicted, this.backtestResiduals);
      const ciLow = Math.round(rawLow);
      const ciHigh = Math.round(rawHigh);

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
