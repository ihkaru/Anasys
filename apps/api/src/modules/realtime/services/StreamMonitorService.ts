import { Logger } from "../../../utils/logger";

const logger = new Logger("StreamMonitor");

/**
 * StreamMonitorService (ADR-0016)
 * Tracks data ingestion latency from Engine to API.
 */
export class StreamMonitorService {
	private static instance: StreamMonitorService;
	private lags: Map<string, number> = new Map();
	private lastReport: number = 0;

	private constructor() {}

	public static getInstance(): StreamMonitorService {
		if (!StreamMonitorService.instance) {
			StreamMonitorService.instance = new StreamMonitorService();
		}
		return StreamMonitorService.instance;
	}

	/**
	 * Records lag for a specific symbol
	 * @param symbol Symbol name
	 * @param lagMs Latency in milliseconds
	 */
	public recordLag(symbol: string, lagMs: number) {
		this.lags.set(symbol, lagMs);

		// Alert if critical lag (> 15s)
		if (lagMs > 15000) {
			logger.warn(`⚠️ Critical lag detected for ${symbol}: ${lagMs}ms`);
		}

		// Periodic report every 60s
		const now = Date.now();
		if (now - this.lastReport > 60000) {
			this.report();
			this.lastReport = now;
		}
	}

	public getStats() {
		const values = Array.from(this.lags.values());
		if (values.length === 0) return { avg: 0, max: 0, count: 0 };

		return {
			avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
			max: Math.max(...values),
			count: values.length,
		};
	}

	private report() {
		const stats = this.getStats();
		if (stats.count > 0) {
			logger.info(`📊 Stream Health: Active=${stats.count}, Avg Lag=${stats.avg}ms, Max Lag=${stats.max}ms`);
		}
	}
}
