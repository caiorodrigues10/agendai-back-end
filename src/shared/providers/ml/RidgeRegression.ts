import { mean } from './StatisticsUtils';

/**
 * Ridge Regression with closed-form solution.
 * y = Xw + b, with L2 regularization: w = (X'X + λI)^-1 X'y
 */
export class RidgeRegression {
  private weights: number[] = [];
  private bias: number = 0;
  private featureMeans: number[] = [];
  private featureStds: number[] = [];
  private targetMean: number = 0;

  /** Train the model. X = features matrix, y = target vector, lambda = regularization */
  fit(X: number[][], y: number[], lambda: number = 1.0): void {
    if (X.length === 0 || X[0].length === 0) return;
    const n = X.length;
    const p = X[0].length;

    // Standardize features
    this.featureMeans = [];
    this.featureStds = [];
    for (let j = 0; j < p; j++) {
      const col = X.map(row => row[j]);
      this.featureMeans.push(mean(col));
      const s = Math.sqrt(col.reduce((sum, v) => sum + (v - this.featureMeans[j]) ** 2, 0) / n) || 1;
      this.featureStds.push(s);
    }
    this.targetMean = mean(y);

    // Normalize X and center y
    const Xn = X.map(row =>
      row.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j])
    );
    const yc = y.map(v => v - this.targetMean);

    // Add bias column (all 1s)
    const Xa = Xn.map(row => [1, ...row]);

    // Solve via normal equation: (X'X + λI)^-1 X'y
    const p1 = p + 1;
    const XtX = this.matMul(this.transpose(Xa), Xa);
    const reg = this.eye(p1).map((row, i) => row.map((v, j) => v * lambda + (i === j ? 1 : 0)));
    const lhs = XtX.map((row, i) => row.map((v, j) => v + reg[i][j]));
    const XtY = this.matVecMul(this.transpose(Xa), yc);
    const sol = this.solveLinearSystem(lhs, XtY);

    this.bias = sol[0] + this.targetMean;
    this.weights = sol.slice(1);
  }

  /** Predict target for a single sample */
  predict(x: number[]): number {
    if (this.weights.length === 0) return this.targetMean;
    const xn = x.map((v, j) => (v - this.featureMeans[j]) / this.featureStds[j]);
    let result = this.bias;
    for (let j = 0; j < this.weights.length; j++) {
      result += this.weights[j] * xn[j];
    }
    return result;
  }

  /** Get feature importance (absolute weight, normalized) */
  getFeatureImportance(): number[] {
    const total = this.weights.reduce((s, w) => s + Math.abs(w), 0) || 1;
    return this.weights.map(w => Math.abs(w) / total);
  }

  /** Get raw weights */
  getWeights(): { weights: number[]; bias: number } {
    return { weights: [...this.weights], bias: this.bias };
  }

  // --- Matrix utilities ---

  private transpose(m: number[][]): number[][] {
    return m[0].map((_, i) => m.map(row => row[i]));
  }

  private matMul(a: number[][], b: number[][]): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < a[0].length; k++) sum += a[i][k] * b[k][j];
        result[i][j] = sum;
      }
    }
    return result;
  }

  private matVecMul(m: number[][], v: number[]): number[] {
    return m.map(row => row.reduce((s, val, i) => s + val * v[i], 0));
  }

  private eye(n: number): number[][] {
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  }

  /** Solve Ax = b via Gaussian elimination with partial pivoting */
  private solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = A.length;
    const aug = A.map((row, i) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
      // Partial pivoting
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
      }
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

      if (Math.abs(aug[col][col]) < 1e-12) continue;

      for (let row = col + 1; row < n; row++) {
        const factor = aug[row][col] / aug[col][col];
        for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j];
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = aug[i][n];
      for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j];
      x[i] /= aug[i][i] || 1;
    }
    return x;
  }
}
