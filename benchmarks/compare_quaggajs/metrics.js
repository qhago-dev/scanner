/**
 * Metrics calculator for benchmark results.
 * Computes comparison statistics between ScanAI and QuaggaJS.
 */

class MetricsCalculator {
  /**
   * Calculate success rate improvement.
   */
  static successImprovement(scanai: number, quagga: number): number {
    const diff = scanai - quagga;
    return diff;
  }

  /**
   * Calculate speed improvement ratio.
   */
  static speedRatio(scanaiTime: number, quaggaTime: number): number {
    if (scanaiTime <= 0) return 0;
    return quaggaTime / scanaiTime;
  }

  /**
   * Calculate precision and recall from test results.
   */
  static precisionRecall(
    results: { detected: boolean; expected: string | null; actual: string | null }[]
  ): { precision: number; recall: number; f1: number } {
    let tp = 0, fp = 0, fn = 0;

    for (const r of results) {
      if (r.detected) {
        if (r.expected && r.actual === r.expected) {
          tp++;
        } else if (!r.expected || r.actual !== r.expected) {
          fp++;
        }
      } else if (r.expected) {
        fn++;
      }
    }

    const precision = tp / Math.max(tp + fp, 1);
    const recall = tp / Math.max(tp + fn, 1);
    const f1 = 2 * (precision * recall) / Math.max(precision + recall, 0.0001);

    return { precision, recall, f1 };
  }

  /**
   * Calculate per-scenario summary statistics.
   */
  static scenarioSummary(
    scenarioName: string,
    total: number,
    scanaiSuccess: number,
    quaggaSuccess: number,
    scanaiAvgTime: number,
    quaggaAvgTime: number
  ) {
    const scanaiRate = (scanaiSuccess / Math.max(total, 1)) * 100;
    const quaggaRate = (quaggaSuccess / Math.max(total, 1)) * 100;
    const improvement = scanaiRate - quaggaRate;
    const speedup = quaggaAvgTime / Math.max(scanaiAvgTime, 1);

    return {
      scenario: scenarioName,
      totalImages: total,
      scanai: {
        successRate: `${scanaiRate.toFixed(1)}%`,
        avgTimeMs: scanaiAvgTime.toFixed(1),
      },
      quagga: {
        successRate: `${quaggaRate.toFixed(1)}%`,
        avgTimeMs: quaggaAvgTime.toFixed(1),
      },
      improvement: `+${improvement.toFixed(1)}%`,
      speedup: `${speedup.toFixed(1)}x`,
      grade:
        improvement >= 30
          ? "A+"
          : improvement >= 20
          ? "A"
          : improvement >= 10
          ? "B"
          : improvement >= 0
          ? "C"
          : "D",
    };
  }

  /**
   * Calculate battery consumption estimate.
   * Based on inference time and scan frequency.
   */
  static batteryEstimate(
    avgInferenceMs: number,
    framesPerSecond: number,
    durationMinutes: number
  ): { mah: number; percentBattery: number } {
    const totalInferenceMs = framesPerSecond * durationMinutes * 60 * avgInferenceMs;
    const mahPerMs = 0.018;
    const mah = totalInferenceMs * mahPerMs;
    const batteryCapacity = 4000;
    const percent = (mah / batteryCapacity) * 100;

    return {
      mah: Math.round(mah * 100) / 100,
      percentBattery: Math.round(percent * 100) / 100,
    };
  }
}

module.exports = { MetricsCalculator };
