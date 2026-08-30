import { mean } from './StatisticsUtils';

interface TreeNode {
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
  prediction?: number;
}

interface TreeOptions {
  maxDepth: number;
  minSamplesLeaf: number;
}

/**
 * Simple Random Forest for regression.
 * Pure TypeScript, no external dependencies.
 */
export class RandomForest {
  private trees: TreeNode[] = [];
  private options: TreeOptions;
  private featureImportances: number[] = [];

  constructor(maxDepth: number = 8, minSamplesLeaf: number = 5) {
    this.options = { maxDepth, minSamplesLeaf };
  }

  fit(X: number[][], y: number[], numTrees: number = 50): void {
    if (X.length === 0) return;
    const numFeatures = X[0].length;
    this.featureImportances = new Array(numFeatures).fill(0);
    this.trees = [];

    for (let t = 0; t < numTrees; t++) {
      // Bootstrap sample
      const indices = this.bootstrap(X.length);
      const Xb = indices.map(i => X[i]);
      const yb = indices.map(i => y[i]);

      // Random feature subset at each split
      const tree = this.buildTree(Xb, yb, 0, numFeatures);
      this.trees.push(tree);
    }

    // Compute feature importances
    const total = this.featureImportances.reduce((s, v) => s + v, 0) || 1;
    this.featureImportances = this.featureImportances.map(v => v / total);
  }

  predict(x: number[]): number {
    if (this.trees.length === 0) return 0;
    const predictions = this.trees.map(tree => this.predictTree(tree, x));
    return mean(predictions);
  }

  predictAll(X: number[][]): number[] {
    return X.map(x => this.predict(x));
  }

  getFeatureImportance(): number[] {
    return [...this.featureImportances];
  }

  /** OOB score estimate */
  getOOBScore(X: number[][], y: number[]): number {
    const predictions = this.predictAll(X);
    const ssRes = y.reduce((s, v, i) => s + (v - predictions[i]) ** 2, 0);
    const ssTot = y.reduce((s, v) => s + (v - mean(y)) ** 2, 0);
    return ssTot > 0 ? 1 - ssRes / ssTot : 0;
  }

  private bootstrap(n: number): number[] {
    return Array.from({ length: n }, () => Math.floor(Math.random() * n));
  }

  private buildTree(X: number[][], y: number[], depth: number, numFeatures: number): TreeNode {
    if (depth >= this.options.maxDepth || y.length <= this.options.minSamplesLeaf || this.allSame(y)) {
      return { prediction: mean(y) };
    }

    // Random feature subset (sqrt of total features)
    const featureSubset = this.sampleFeatures(numFeatures, Math.max(1, Math.floor(Math.sqrt(numFeatures))));

    let bestFeature = 0;
    let bestThreshold = 0;
    let bestScore = Infinity;

    for (const f of featureSubset) {
      const values = X.map(row => row[f]);
      const thresholds = this.getThresholds(values);
      for (const t of thresholds) {
        const leftIdx: number[] = [];
        const rightIdx: number[] = [];
        X.forEach((row, i) => {
          if (row[f] <= t) leftIdx.push(i);
          else rightIdx.push(i);
        });
        if (leftIdx.length < this.options.minSamplesLeaf || rightIdx.length < this.options.minSamplesLeaf) continue;
        const score = this.mseSplit(y, leftIdx, rightIdx);
        if (score < bestScore) {
          bestScore = score;
          bestFeature = f;
          bestThreshold = t;
        }
      }
    }

    if (bestScore === Infinity) return { prediction: mean(y) };

    // Track feature importance
    const improvement = this.variance(y) - bestScore;
    if (improvement > 0) this.featureImportances[bestFeature] += improvement;

    const leftX: number[][] = [];
    const leftY: number[] = [];
    const rightX: number[][] = [];
    const rightY: number[] = [];
    X.forEach((row, i) => {
      if (row[bestFeature] <= bestThreshold) {
        leftX.push(row);
        leftY.push(y[i]);
      } else {
        rightX.push(row);
        rightY.push(y[i]);
      }
    });

    return {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      left: this.buildTree(leftX, leftY, depth + 1, numFeatures),
      right: this.buildTree(rightX, rightY, depth + 1, numFeatures),
    };
  }

  private predictTree(node: TreeNode, x: number[]): number {
    if (node.prediction !== undefined) return node.prediction;
    if (node.featureIndex === undefined || node.threshold === undefined) return 0;
    if (x[node.featureIndex] <= node.threshold) {
      return node.left ? this.predictTree(node.left, x) : 0;
    }
    return node.right ? this.predictTree(node.right, x) : 0;
  }

  private getThresholds(values: number[]): number[] {
    const unique = [...new Set(values)].sort((a, b) => a - b);
    if (unique.length <= 10) return unique;
    const step = Math.max(1, Math.floor(unique.length / 10));
    return unique.filter((_, i) => i % step === 0);
  }

  private sampleFeatures(total: number, count: number): number[] {
    const indices = Array.from({ length: total }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, count);
  }

  private variance(arr: number[]): number {
    const m = mean(arr);
    return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  }

  private allSame(arr: number[]): boolean {
    if (arr.length <= 1) return true;
    return arr.every(v => v === arr[0]);
  }

  private mseSplit(y: number[], leftIdx: number[], rightIdx: number[]): number {
    const total = y.length;
    const leftVar = leftIdx.length > 1 ? this.variance(leftIdx.map(i => y[i])) : 0;
    const rightVar = rightIdx.length > 1 ? this.variance(rightIdx.map(i => y[i])) : 0;
    return (leftIdx.length / total) * leftVar + (rightIdx.length / total) * rightVar;
  }

  /** Serialize model for Redis storage */
  serialize(): object {
    return {
      trees: this.trees.map(t => this.serializeNode(t)),
      featureImportances: this.featureImportances,
    };
  }

  private serializeNode(node: TreeNode): object {
    return {
      featureIndex: node.featureIndex,
      threshold: node.threshold,
      prediction: node.prediction,
      left: node.left ? this.serializeNode(node.left) : null,
      right: node.right ? this.serializeNode(node.right) : null,
    };
  }

  static deserialize(data: any): RandomForest {
    const rf = new RandomForest();
    rf.trees = data.trees.map((t: any) => rf.deserializeNode(t));
    rf.featureImportances = data.featureImportances;
    return rf;
  }

  private deserializeNode(data: any): TreeNode {
    return {
      featureIndex: data.featureIndex,
      threshold: data.threshold,
      prediction: data.prediction,
      left: data.left ? this.deserializeNode(data.left) : undefined,
      right: data.right ? this.deserializeNode(data.right) : undefined,
    };
  }
}
