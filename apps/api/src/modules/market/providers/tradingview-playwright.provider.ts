import { Logger } from "../../../utils/logger";
import { playwrightManager } from "../../../utils/playwright-manager";
import type {
	IDataProvider,
	QuoteResult,
	SearchResult,
	UnifiedCandle,
	TrendingResult,
} from "./data-provider.interface";

const logger = new Logger("TradingViewPlaywrightProvider");

export class TradingViewPlaywrightProvider implements IDataProvider {
	getName(): string {
		return "tradingview";
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		const interval = options.interval || "1h";
		const limit = options.limit || 300;

		try {
			const page = await playwrightManager.getPage();

			// Capture console logs from the browser for debugging
			page.on("console", (msg) => logger.debug(`[Browser] ${msg.text()}`));

			// Inject the harvesting script into the page
			const data = await page.evaluate(
				async ({ symbol, res, range }) => {
					return new Promise((resolve, reject) => {
						console.log(`Starting WS bridge for ${symbol}...`);
						const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket?from=chart%2F&type=chart");
						const session = "cs_" + Math.random().toString(36).substring(2, 12);
						const chartSession = "cs_" + Math.random().toString(36).substring(2, 12);

						let candles: any[] = [];
						const timeout = setTimeout(() => {
							ws.close();
							reject(new Error("TradingView timeout after 15s"));
						}, 15000);

						const send = (m: string, p: any[]) => {
							const msg = JSON.stringify({ m, p });
							ws.send(`~m~${msg.length}~m~${msg}`);
						};

						ws.onmessage = (event) => {
							const raw = event.data;
							if (typeof raw !== "string") return;

							// Split multiple messages in one frame
							const parts = raw.split(/~m~\d+~m~/).filter((p) => p.trim().startsWith("{"));

							for (const part of parts) {
								try {
									const data = JSON.parse(part);

									if (data.m === "timescale_update") {
										const payload = data.p[1];
										const series = payload[Object.keys(payload)[0]];
										if (series && series.s) {
											console.log(`Received ${series.s.length} candles for ${symbol}`);
											candles = series.s.map((b: any) => ({
												timestamp: b.v[0] * 1000,
												open: b.v[1],
												high: b.v[2],
												low: b.v[3],
												close: b.v[4],
												volume: b.v[5],
											}));

											clearTimeout(timeout);
											ws.close();
											resolve(candles);
										}
									} else if (data.m === "series_error") {
										reject(new Error(`TradingView series error: ${JSON.stringify(data.p)}`));
									} else if (data.m === "critical_error") {
										reject(new Error(`TradingView critical error: ${JSON.stringify(data.p)}`));
									}
								} catch (e) {
									console.error("Parse error:", e);
								}
							}
						};

						ws.onopen = () => {
							send("set_auth_token", ["unauthorized_user_token"]);
							send("chart_create_session", [chartSession, ""]);
							send("quote_create_session", [session]);
							send("resolve_symbol", [chartSession, "sds_sym_1", `={"symbol":"${symbol}","adjustment":"splits"}`]);
							send("create_series", [chartSession, "sds_1", "s1", "sds_sym_1", res, range, ""]);
						};

						ws.onerror = (err) => {
							clearTimeout(timeout);
							reject(new Error("WebSocket error inside browser"));
						};
					});
				},
				{ symbol: ticker, res: this.mapInterval(interval), range: limit },
			);

			return (data as any[]).map((c) => ({
				timestamp: new Date(c.timestamp),
				open: c.open,
				high: c.high,
				low: c.low,
				close: c.close,
				volume: c.volume,
			}));
		} catch (err) {
			logger.error(`Failed to fetch chart for ${ticker}`, err);
			return [];
		}
	}

	private mapInterval(interval: string): string {
		const map: Record<string, string> = {
			"1m": "1",
			"3m": "3",
			"5m": "5",
			"15m": "15",
			"30m": "30",
			"1h": "60",
			"2h": "120",
			"4h": "240",
			"1d": "D",
			"1w": "W",
			"1M": "M",
		};
		return map[interval] || "60";
	}

	async fetchQuotes(tickers: string[]): Promise<QuoteResult[]> {
		// For simplicity, reuse the Yahoo provider or implement later
		return [];
	}

	async search(query: string, limit?: number): Promise<SearchResult[]> {
		return [];
	}

	async fetchQuoteSummary(ticker: string, modules: string[]): Promise<unknown> {
		return {};
	}

	async fetchTrending(region?: string, count?: number): Promise<TrendingResult[]> {
		return [];
	}

	async fetchRecommendations(ticker: string): Promise<string[]> {
		return [];
	}

	async fetchDailyGainers(count?: number): Promise<QuoteResult[]> {
		return [];
	}

	async fetchDailyLosers(count?: number): Promise<QuoteResult[]> {
		return [];
	}
}
