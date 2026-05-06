import { Logger } from "../../../utils/logger";
import type {
	IDataProvider,
	QuoteResult,
	SearchResult,
	UnifiedCandle,
	TrendingResult,
} from "./data-provider.interface";

const logger = new Logger("TradingViewSocketProvider");

export class TradingViewSocketProvider implements IDataProvider {
	getName(): string {
		return "tradingview_socket";
	}

	async fetchChart(ticker: string, options: any): Promise<UnifiedCandle[]> {
		const interval = options.interval || "1h";
		const limit = options.limit || 300;

		return new Promise((resolve, reject) => {
			logger.info(`Starting direct WebSocket fetch for ${ticker} (${interval})...`);

			const ws = new WebSocket("wss://data.tradingview.com/socket.io/websocket?from=chart%2F&type=chart", {
				headers: {
					Origin: "https://www.tradingview.com",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
			} as any);

			const session = `cs_${Math.random().toString(36).substring(2, 12)}`;
			const chartSession = `cs_${Math.random().toString(36).substring(2, 12)}`;
			const _candles: any[] = [];

			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error(`TradingView direct socket timeout for ${ticker}`));
			}, 20000);

			const send = (m: string, p: any[]) => {
				const msg = JSON.stringify({ m, p });
				ws.send(`~m~${msg.length}~m~${msg}`);
			};

			ws.onmessage = (event) => {
				const raw = event.data;
				if (typeof raw !== "string") return;

				// Split multiple messages in one frame
				const messages = raw.split(/~m~\d+~m~/).filter((m) => m.length > 0);

				for (const message of messages) {
					// Handle Heartbeat
					if (message.startsWith("~h~")) {
						ws.send(`~m~${message.length}~m~${message}`);
						continue;
					}

					try {
						const data = JSON.parse(message);

						if (data.m === "timescale_update") {
							const payload = data.p[1];
							const series = payload[Object.keys(payload)[0]];
							if (series?.s) {
								logger.debug(`Received ${series.s.length} candles for ${ticker}`);
								const result = series.s.map((b: any) => ({
									timestamp: new Date(b.v[0] * 1000),
									open: b.v[1],
									high: b.v[2],
									low: b.v[3],
									close: b.v[4],
									volume: b.v[5],
								}));

								clearTimeout(timeout);
								ws.close();
								resolve(result);
							}
						} else if (data.m === "series_error" || data.m === "critical_error" || data.m === "symbol_error") {
							clearTimeout(timeout);
							ws.close();
							reject(new Error(`TradingView socket error (${data.m}): ${JSON.stringify(data.p)}`));
						}
					} catch (_e) {
						// Not JSON or other parse error, ignore
					}
				}
			};

			ws.onopen = () => {
				send("set_auth_token", ["unauthorized_user_token"]);
				send("chart_create_session", [chartSession, ""]);
				send("quote_create_session", [session]);
				send("resolve_symbol", [chartSession, "sds_sym_1", `={"symbol":"${ticker}","adjustment":"splits"}`]);
				send("create_series", [chartSession, "sds_1", "s1", "sds_sym_1", this.mapInterval(interval), limit, ""]);
			};

			ws.onerror = (err) => {
				clearTimeout(timeout);
				reject(err);
			};
		});
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
			"1wk": "W",
			"1w": "W",
			"1mo": "M",
			"1M": "M",
		};
		const mapped = map[interval];
		if (!mapped) {
			throw new Error(`Unsupported interval for TradingView: ${interval}`);
		}
		return mapped;
	}

	async fetchQuotes(_tickers: string[]): Promise<QuoteResult[]> {
		// For simplicity, reuse the Yahoo provider or implement later
		return [];
	}

	async search(_query: string, _limit?: number): Promise<SearchResult[]> {
		return [];
	}

	async fetchQuoteSummary(_ticker: string, _modules: string[]): Promise<unknown> {
		return {};
	}

	async fetchTrending(_region?: string, _count?: number): Promise<TrendingResult[]> {
		return [];
	}

	async fetchRecommendations(_ticker: string): Promise<string[]> {
		return [];
	}

	async fetchDailyGainers(_count?: number): Promise<QuoteResult[]> {
		return [];
	}

	async fetchDailyLosers(_count?: number): Promise<QuoteResult[]> {
		return [];
	}
}
