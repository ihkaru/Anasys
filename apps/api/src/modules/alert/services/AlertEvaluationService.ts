import { PineTS } from "pinets";
import { questDbService } from "../../market/services/QuestDBService";
import { Logger } from "../../../utils/logger";

export interface AlertEvaluationResult {
	isTriggered: boolean;
	lastValue: number;
	allValues: any;
	snapshot: string;
}

export class AlertEvaluationService {
	private logger = new Logger("AlertEvaluationService");

	/**
	 * Evaluates a Pine Script alert against recent market data.
	 * Returns trigger status and data snapshot.
	 */
	async evaluate(
		ticker: string,
		interval: string,
		source: string,
		pineScript: string,
	): Promise<AlertEvaluationResult | null> {
		try {
			// 1. Fetch data from QuestDB (Need enough bars for indicators, e.g., 200)
			const rawCandles = await questDbService.getCandles(ticker, interval, source, 200);

			if (rawCandles.length < 2) {
				this.logger.warn(`Not enough data to evaluate alert for ${ticker} (${rawCandles.length} bars)`);
				return null;
			}

			// 2. Format for PineTS (Array of candle objects)
			const candles = rawCandles.map((c) => ({
				openTime: new Date(c.timestamp).getTime(),
				open: Number(c.open),
				high: Number(c.high),
				low: Number(c.low),
				close: Number(c.close),
				volume: Number(c.volume),
			}));

			// 3. Initialize and run PineTS
			const runtime = new PineTS(candles);
			const { plots } = await runtime.run(pineScript);

			// 4. Determine if alert is triggered
			// Convention: We look for a plot named "Trigger" or the last plot in the script.
			// If the value > 0, it's a trigger.
			let triggerPlot = plots["Trigger"];

			// Fallback: If no "Trigger" plot, look for any plot that has 0/1 values (boolean-like)
			if (!triggerPlot) {
				const plotKeys = Object.keys(plots).filter((k) => !k.startsWith("__"));
				if (plotKeys.length > 0) {
					// Use the last plot defined as the trigger
					triggerPlot = plots[plotKeys[plotKeys.length - 1]];
				}
			}

			if (!triggerPlot || !triggerPlot.data || triggerPlot.data.length === 0) {
				this.logger.warn(`No valid plots found in script for ${ticker}`);
				return null;
			}

			const lastEntry = triggerPlot.data[triggerPlot.data.length - 1];
			const isTriggered = lastEntry.value > 0;

			// 5. Create snapshot for history
			const snapshot: Record<string, any> = {};
			for (const key of Object.keys(plots)) {
				if (!key.startsWith("__")) {
					const data = plots[key].data;
					snapshot[key] = data[data.length - 1]?.value;
				}
			}

			return {
				isTriggered,
				lastValue: lastEntry.value,
				allValues: plots,
				snapshot: JSON.stringify(snapshot),
			};
		} catch (e) {
			this.logger.error(`Alert evaluation failed for ${ticker}:`, e);
			return null;
		}
	}
}

export const alertEvaluationService = new AlertEvaluationService();
