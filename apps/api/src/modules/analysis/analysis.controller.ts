import { cookie } from "@elysiajs/cookie";
import { jwt } from "@elysiajs/jwt";
import { type OHLCV, type Signal, strategySMA } from "@packages/analysis/src";
import { Elysia, t } from "elysia";
import { getJwtSecret } from "../../config";
import { Logger } from "../../utils/logger";
import { marketService } from "../market/market.service";

const logger = new Logger("AnalysisController");

export const analysisController = new Elysia({ prefix: "/analysis" })
	.use(
		jwt({
			name: "jwt",
			secret: getJwtSecret(),
		}),
	)
	.use(cookie())
	.derive(async ({ jwt, cookie: { auth }, headers }) => {
		let token: string | undefined = auth?.value as string | undefined;
		const authHeader = headers.authorization;

		if (!token && authHeader?.startsWith("Bearer ")) {
			token = authHeader.substring(7);
		}

		if (!token) return { user: null };

		try {
			const profile = await jwt.verify(token);
			if (profile) {
				logger.debug(`Authenticated: ${profile.email}`);
			}
			return { user: profile || null };
		} catch (e) {
			logger.warn(`JWT verification failed`, e);
			return { user: null };
		}
	})
	.post(
		"/run",
		async (context: any) => {
			const { body, set, user } = context;
			const { ticker, strategy, shortPeriod, longPeriod } = body;
			logger.info(`Analysis RUN: ${ticker} (${strategy}) by ${user?.email || "Unknown"}`);
			try {
				// Get historical data from DB
				const rawData = await marketService.getOHLCV(ticker, "1d", 365); // 1 year

				if (rawData.length === 0) {
					logger.warn(`Analysis failed: No data for ${ticker}`);
					set.status = 404;
					return { success: false, error: "No data for this ticker. Please sync first." };
				}

				// Convert to OHLCV format
				const ohlcvData: OHLCV[] = rawData.map((d) => ({
					timestamp: d.timestamp,
					open: Number(d.open),
					high: Number(d.high),
					low: Number(d.low),
					close: Number(d.close),
					volume: Number(d.volume),
				}));

				let signals: Signal[] = [];

				// Run strategy
				switch (strategy) {
					case "SMA_CROSSOVER":
						signals = strategySMA(ohlcvData, shortPeriod ?? 9, longPeriod ?? 21);
						break;
					default:
						logger.warn(`Unknown strategy requested: ${strategy}`);
						set.status = 400;
						return { success: false, error: `Unknown strategy: ${strategy}` };
				}

				logger.info(`Analysis success: ${signals.length} signals generated for ${ticker}`);
				return {
					success: true,
					ticker,
					strategy,
					signalCount: signals.length,
					signals,
				};
			} catch (error) {
				logger.error("Analysis execution error", error);
				set.status = 500;
				return { success: false, error: (error as Error).message };
			}
		},
		{
			beforeHandle: (context: any) => {
				const { user, set } = context;
				if (!user) {
					logger.warn("Analysis Unauthorized attempt");
					set.status = 401;
					return { success: false, error: "Unauthorized" };
				}
			},
			body: t.Object({
				ticker: t.String({ minLength: 1 }),
				strategy: t.String({ minLength: 1 }),
				shortPeriod: t.Optional(t.Number({ minimum: 1, maximum: 200 })),
				longPeriod: t.Optional(t.Number({ minimum: 1, maximum: 500 })),
			}),
		},
	);
