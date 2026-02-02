import { beforeEach, describe, expect, it, jest } from "bun:test";
import type { Logger } from "../../../utils/logger";
import type { IDataProvider } from "../providers/data-provider.interface";
import type { MarketDataRepository } from "../repositories/market-data.repository";
import type { SymbolService } from "./symbol.service";
import { SyncService } from "./sync.service";

// Mocks
const mockSymbolService = {
	ensureSymbol: jest.fn().mockResolvedValue({ id: 1, ticker: "TEST" }),
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

describe("SyncService", () => {
	let service: SyncService;

	beforeEach(() => {
		service = new SyncService(mockSymbolService, mockMarketDataRepo, mockDataProvider, mockLogger);
		jest.clearAllMocks();
	});

	it("should normalize 1h US market candles from :30 to :00", async () => {
		// Setup raw data from Yahoo (Market Open 9:30 EST -> 13:30/14:30 UTC)
		// Let's use winter time (UTC-5): 9:30 EST = 14:30 UTC
		const rawCandles = [
			{
				date: new Date("2023-12-01T14:30:00Z"), // 9:30 AM EST
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
			},
			{
				date: new Date("2023-12-01T15:30:00Z"), // 10:30 AM EST
				open: 102,
				high: 108,
				low: 101,
				close: 107,
				volume: 1500,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue({
			quotes: rawCandles,
		});

		const result = await service.syncSymbolData("TEST", "STOCK", "1h");

		expect(result.status).toBe("success");
		expect(result.count).toBe(2);

		// Check what verify called marketDataRepo.upsert with
		const upsertCall = (mockMarketDataRepo.upsert as jest.Mock).mock.calls[0][0];
		expect(upsertCall).toHaveLength(2);

		// Verify timestamps are normalized to :00
		expect(upsertCall[0].timestamp.toISOString()).toBe("2023-12-01T14:00:00.000Z");
		expect(upsertCall[1].timestamp.toISOString()).toBe("2023-12-01T15:00:00.000Z");

		expect(upsertCall[0].timestamp.getMinutes()).toBe(0);
		expect(upsertCall[1].timestamp.getMinutes()).toBe(0);
	});

	it("should handle pre-market candles that are already aligned", async () => {
		// Pre-market 9:00 AM EST = 14:00 UTC
		const rawCandles = [
			{
				date: new Date("2023-12-01T14:00:00Z"),
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue({
			quotes: rawCandles,
		});

		await service.syncSymbolData("TEST", "STOCK", "1h");

		const upsertCall = (mockMarketDataRepo.upsert as jest.Mock).mock.calls[0][0];
		expect(upsertCall[0].timestamp.toISOString()).toBe("2023-12-01T14:00:00.000Z"); // Should stay same
	});

	it("should strict enforce 1h alignment via guardrail", async () => {
		// ... (previous test) ...
		const rawCandles = [
			{
				date: new Date("2023-12-01T14:45:00Z"),
				open: 100,
				high: 105,
				low: 95,
				close: 102,
				volume: 1000,
			},
		];
		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue({ quotes: rawCandles });
		await service.syncSymbolData("TEST", "STOCK", "1h");
		const upsertCall = (mockMarketDataRepo.upsert as jest.Mock).mock.calls[0][0];
		expect(upsertCall[0].timestamp.toISOString()).toBe("2023-12-01T14:00:00.000Z");
	});

	it("should handle collision: prioritize high volume regular candle over empty pre-market candle", async () => {
		// Scenario:
		// 1. Pre-market at 14:00 UTC (9:00 EST) -> Volume 0
		// 2. Regular at 14:30 UTC (9:30 EST) -> Volume 1000
		// Both normalize to 14:00 UTC. Logic should keep the Volume 1000 one.
		const rawCandles = [
			{
				date: new Date("2023-12-01T14:00:00Z"),
				open: 100,
				high: 100,
				low: 100,
				close: 100,
				volume: 0,
			},
			{
				date: new Date("2023-12-01T14:30:00Z"),
				open: 101,
				high: 105,
				low: 99,
				close: 102,
				volume: 1000,
			},
		];

		(mockDataProvider.fetchChart as jest.Mock).mockResolvedValue({ quotes: rawCandles });

		const result = await service.syncSymbolData("TEST", "STOCK", "1h");

		expect(result.count).toBe(1); // Should only be 1 value at 14:00
		const upsertCall = (mockMarketDataRepo.upsert as jest.Mock).mock.calls[0][0];
		const savedCandle = upsertCall[0];

		expect(savedCandle.timestamp.toISOString()).toBe("2023-12-01T14:00:00.000Z");
		expect(savedCandle.volume).toBe(1000); // Should have taken the high volume one
		expect(savedCandle.open).toBe(101); // Should match the 14:30 candle data
	});
});
