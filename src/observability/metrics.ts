import { injectable } from "inversify";

export interface MetricSummary {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalTokens: number;
  avgDurationMs: number;
}

@injectable()
export class MetricsService {
  private totalRuns: number = 0;
  private successfulRuns: number = 0;
  private failedRuns: number = 0;
  private totalTokens: number = 0;
  private durations: number[] = [];

  public recordRun(success: boolean, durationMs: number, tokens: number = 0): void {
    this.totalRuns++;
    if (success) {
      this.successfulRuns++;
    } else {
      this.failedRuns++;
    }
    this.totalTokens += tokens;
    this.durations.push(durationMs);
    if (this.durations.length > 1000) {
      this.durations.shift();
    }
  }

  public getSummary(): MetricSummary {
    const sum = this.durations.reduce((a, b) => a + b, 0);
    const avgDurationMs = this.durations.length > 0 ? Math.round(sum / this.durations.length) : 0;

    return {
      totalRuns: this.totalRuns,
      successfulRuns: this.successfulRuns,
      failedRuns: this.failedRuns,
      totalTokens: this.totalTokens,
      avgDurationMs,
    };
  }

  public reset(): void {
    this.totalRuns = 0;
    this.successfulRuns = 0;
    this.failedRuns = 0;
    this.totalTokens = 0;
    this.durations = [];
  }
}
