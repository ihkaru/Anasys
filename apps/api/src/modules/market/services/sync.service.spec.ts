import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { Logger } from "../../../utils/logger";
import type { IDataProvider } from "../providers/data-provider.interface";
import type { MarketDataRepository } from "../repositories/market-data.repository";
import type { SymbolService } from "./symbol.service";
import { SyncService } from "./sync.service";

// Mocks
const mockSymbolService = {
	ensureSymbol: jest.fn().mockResolvedValue({ id: 1, ticker: "TEST", type: "STOCK" }),
} as unknown as SymbolService;

const mockMarketDataRepo = {
	getLastTimestamp: jest.fn().mockResolvedValue(null),
	upsert: jest.fn().mockResolvedValue(undefined),
} as unknown as MarketDataRepository;

const mockDataProvider = {
	fetchChart: jest.fn(),
	fetchQuoteSummary: jest.fn(),
	fetchQuotes: jest.fn(),
	search: jest.fn(),
	fetchTrending: jest.fn(),
	fetchRecommendations: jest.fn(),
	fetchDailyGainers: jest.fn(),
	fetchDailyLosers: jest.fn(),
	getName: jest.fn().mockReturnValue("mock"),
} as unknown as IDataProvider;

const mockLogger = {
	info: jest.fn(),
	debug: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
} as unknown as Logger;

const mockRedis = {
	multi: jest.fn().mockReturnThis(),
	sadd: jest.fn().mockReturnThis(),
	publish: jest.fn().mockReturnThis(),
	exec: jest.fn().mockResolvedValue([]),
} as any;

const mockProviderFactory = {
	getProvider: jest.fn().mockReturnValue(mockDataProvider),
} as any;

describe("SyncService", () => {
	let service: SyncService;

	beforeEach(() => {
		service = new SyncService(mockSymbolService, mockProviderFactory, mockRedis, mockLogger);
		jest.clearAllMocks();
		// Re-setup default mocks after clearing
		(mockSymbolService.ensureSymbol as jest.Mock).mockResolvedValue({ id: 1, ticker: "TEST", type: "STOCK" });
		(mockMarketDataRepo.getLastTimestamp as jest.Mock).mockResolvedValue(null);
		(mockProviderFactory.getProvider as jest.Mock).mockReturnValue(mockDataProvider);
	});

	it("should store raw timestamps without normalization", async () => {
		// Yahoo sends 1h candles at :30 for US stocks (market opens 9:30 EST = 14:30 UTC)
		const rawCandles = [
			{
				timestamp: new Date("2023-12-01T14:30:00Z"), // 9:30 AM EST
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
			},
			{
				timestamp: new Date("2023-12-01T15:30:00Z"), // 10:30 AM EST
				open: 102,
				high: 108,
				low: 101,
				close: 107,
				volume: 1500,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue(rawCandles);

		const result = await service.syncSymbolData("TEST", "STOCK", "1h");

		expect(result.status).toBe("success");
		expect(result.count).toBe(2);

		const upsertCall = (mockMarketDataRepo.upsert as jest.Mock).mock.calls[0][0];
		expect(upsertCall).toHaveLength(2);

		// Timestamps should be PRESERVED as-is (not rounded to :00)
		expect(upsertCall[0].timestamp.toISOString()).toBe("2023-12-01T14:30:00.000Z");
		expect(upsertCall[1].timestamp.toISOString()).toBe("2023-12-01T15:30:00.000Z");
	});

	it("should keep different timestamps as separate candles (no collision)", async () => {
		// Pre-market at 14:00 UTC and regular at 14:30 UTC should both be stored
		const rawCandles = [
			{
				timestamp: new Date("2023-12-01T14:00:00Z"),
				open: 100,
				high: 100,
				low: 100,
				close: 100,
				volume: 0,
			},
			{
				timestamp: new Date("2023-12-01T14:30:00Z"),
				open: 101,
				high: 105,
				low: 99,
				close: 102,
				volume: 1000,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue(rawCandles);

		const result = await service.syncSymbolData("TEST", "STOCK", "1h");

		// The flat pre-market candle at 14:00 will be rejected by DataValidator (Rule 10: O=H=L=C)
		// Only the normal candle at 14:30 should survive
		expect(result.count).toBe(1);
		expect(result.rejected).toBeGreaterThan(0);

		const upsertCall = (mockMarketDataRepo.upsert as jest.Mock).mock.calls[0][0];
		expect(upsertCall[0].timestamp.toISOString()).toBe("2023-12-01T14:30:00.000Z");
		expect(upsertCall[0].open).toBe(101);
	});

	it("should reject flat candles (O=H=L=C) for stocks via DataValidator", async () => {
		const rawCandles = [
			{
				timestamp: new Date("2023-12-01T14:00:00Z"),
				open: 100,
				high: 100,
				low: 100,
				close: 100,
				volume: 50000,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue(rawCandles);

		const result = await service.syncSymbolData("TEST", "STOCK", "1h");

		expect(result.rejected).toBeGreaterThan(0);
		expect(result.count).toBe(0);
	});

	it("should NOT reject flat candles for crypto", async () => {
		(mockSymbolService.ensureSymbol as jest.Mock).mockResolvedValue({ id: 1, ticker: "BTC-USD", type: "CRYPTO" });

		const rawCandles = [
			{
				timestamp: new Date("2023-12-01T14:00:00Z"),
				open: 42000,
				high: 42000,
				low: 42000,
				close: 42000,
				volume: 100,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue(rawCandles);

		const result = await service.syncSymbolData("BTC-USD", "CRYPTO", "1h");

		expect(result.count).toBe(1); // Should be accepted for crypto
	});
});
