import { mean } from './StatisticsUtils';

/**
 * Classical seasonal decomposition: y = trend + seasonal + residual
 * Supports weekly (7-day) and yearly (12-month) patterns.
 */
export class SeasonalDecomposition {
  trend: number = 0;
  weeklyPattern: number[] = new Array(7).fill(1);
  yearlyPattern: number[] = new Array(12).fill(1);
  residualStd: number = 1;

  /**
   * @param dates - ISO date strings sorted ascending
   * @param values - corresponding values (queue count)
   */
  fit(dates: string[], values: number[]): void {
    if (dates.length < 14) {
      this.trend = mean(values);
      return;
    }

    // 1. Compute overall mean
    const overallMean = mean(values);

    // 2. Weekly pattern (day-of-week averages / overall mean)
    const byDow: number[][] = Array.from({ length: 7 }, () => []);
    dates.forEach((d, i) => {
      const dow = new Date(d).getDay();
      byDow[dow].push(values[i]);
    });
    const dowMeans = byDow.map(arr => mean(arr));
    this.weeklyPattern = dowMeans.map(m => overallMean > 0 ? m / overallMean : 1);

    // 3. Monthly pattern (month averages / overall mean)
    const byMonth: number[][] = Array.from({ length: 12 }, () => []);
    dates.forEach((d, i) => {
      const month = new Date(d).getMonth();
      byMonth[month].push(values[i]);
    });
    const monthMeans = byMonth.map(arr => mean(arr));
    this.yearlyPattern = monthMeans.map(m => overallMean > 0 ? m / overallMean : 1);

    // 4. Trend via linear regression on day index
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = overallMean;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (values[i] - yMean);
      den += (i - xMean) ** 2;
    }
    this.trend = den > 0 ? num / den : 0;

    // 5. Residual std (after removing trend + seasonal)
    const residuals = values.map((v, i) => {
      const d = new Date(dates[i]);
      const trendComponent = yMean + this.trend * (i - xMean);
      const seasonalComponent = this.weeklyPattern[d.getDay()] * this.yearlyPattern[d.getMonth()];
      return v - trendComponent * seasonalComponent;
    });
    this.residualStd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n) || 1;
  }

  /** Predict baseline for a given date (trend + seasonal) */
  predict(dateStr: string, dayIndex: number, totalDays: number): { baseline: number; lower: number; upper: number } {
    const d = new Date(dateStr);
    const dow = d.getDay();
    const month = d.getMonth();
    const xMean = (totalDays - 1) / 2;

    const trendComponent = this.trend * (dayIndex - xMean);
    const seasonal = this.weeklyPattern[dow] * this.yearlyPattern[month];
    const baseline = Math.max(0, (this.trend >= 0 ? 1 : 1) * (1 + trendComponent / 20) * seasonal);

    return {
      baseline: Math.max(0, baseline),
      lower: Math.max(0, baseline - 1.96 * this.residualStd),
      upper: baseline + 1.96 * this.residualStd,
    };
  }
}
