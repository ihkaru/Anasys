import { Logger } from "../../../utils/logger";
import type { Broadcaster } from "../broadcasting/Broadcaster";
import type { QuoteUpdate } from "../realtime.types";

const logger = new Logger("TradingViewHandler");

export class TradingViewStreamHandler {
	private process: any = null;
	private updateTimer: ReturnType<typeof setTimeout> | null = null;
	private stocksToPoll = new Set<string>();

	constructor(private broadcaster: Broadcaster) {}

	addSymbol(symbol: string) {
		if (!this.stocksToPoll.has(symbol)) {
			logger.info(`Adding TradingView stock to stream: ${symbol}`);
			this.stocksToPoll.add(symbol);
			this.scheduleStreamUpdate();
		}
	}

	removeSymbol(symbol: string) {
		if (this.stocksToPoll.has(symbol)) {
			this.stocksToPoll.delete(symbol);
			this.scheduleStreamUpdate();
		}
	}

	private scheduleStreamUpdate() {
		if (this.updateTimer) clearTimeout(this.updateTimer);

		this.updateTimer = setTimeout(() => {
			this.restartStream();
			this.updateTimer = null;
		}, 1000); // 1s debounce
	}

	private restartStream() {
		if (this.process) {
			logger.info("Restarting TradingView stream to update symbols...");
			this.process.removeAllListeners("close");
			this.process.kill();
			this.process = null;
		}
		this.ensureStream();
	}

	private ensureStream() {
		if (this.process) return;

		const symbols = Array.from(this.stocksToPoll);
		if (symbols.length === 0) return;

		logger.info(`Starting TradingView stream for ${symbols.length} symbols...`);

		const { spawn } = require("child_process");
		const args = JSON.stringify({ symbols });

		this.process = spawn("python3", ["src/scripts/bridge_tradingview.py", "stream", args]);

		this.process.stdout.on("data", (data: Buffer) => {
			const lines = data
				.toString()
				.split("\n")
				.filter((l: string) => l.trim());
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line);
					if (parsed.type === "quote") {
						const update: QuoteUpdate = {
							symbol: parsed.symbol,
							price: parsed.price || 0,
							change: parsed.change || 0,
							changePercent: parsed.changePercent || 0,
							volume: parsed.volume,
							timestamp: parsed.timestamp ? parsed.timestamp * 1000 : Date.now(),
						};
						const baseSymbol = parsed.symbol.includes(":") ? parsed.symbol.split(":")[1] : parsed.symbol;
						this.broadcaster.broadcastQuote(baseSymbol, update);
					}
				} catch (_e) {
					// Ignore parse errors
				}
			}
		});

		this.process.stderr.on("data", (data: Buffer) => {
			logger.error(`TradingView stream error: ${data.toString()}`);
		});

		this.process.on("close", (code: number) => {
			logger.warn(`TradingView stream closed with code ${code}, restarting in 5s...`);
			this.process = null;
			setTimeout(() => this.ensureStream(), 5000);
		});
	}

	shutdown() {
		if (this.process) {
			this.process.removeAllListeners("close");
			this.process.kill();
			this.process = null;
		}
		if (this.updateTimer) {
			clearTimeout(this.updateTimer);
		}
	}
}
