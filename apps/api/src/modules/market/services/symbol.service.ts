import type Redis from "ioredis";
import type { Logger } from "../../../utils/logger";
import type { IDataProvider } from "../providers/data-provider.interface";
import type { SymbolRepository } from "../repositories/symbol.repository";

// ... (CRYPTO_PROFILES remains same)
const CRYPTO_PROFILES: Record<string, { name: string; description: string; website?: string }> = {
	"BTC-USD": {
		name: "Bitcoin",
		description:
			"Bitcoin is a decentralized digital currency, without a central bank or single administrator. It can be sent from user to user on the peer-to-peer bitcoin network without intermediaries.",
		website: "https://bitcoin.org",
	},
	"ETH-USD": {
		name: "Ethereum",
		description:
			"Ethereum is a decentralized, open-source blockchain featuring smart contract functionality. Ether is the native cryptocurrency and is the second-largest by market capitalization.",
		website: "https://ethereum.org",
	},
	"BNB-USD": {
		name: "BNB",
		description:
			"BNB is the cryptocurrency of the BNB Chain ecosystem. It is one of the most popular utility tokens and powers the Binance ecosystem.",
		website: "https://www.bnbchain.org",
	},
	"SOL-USD": {
		name: "Solana",
		description:
			"Solana is a high-performance blockchain supporting builders around the world creating crypto apps. It is known for its speed and low transaction costs.",
		website: "https://solana.com",
	},
	"XRP-USD": {
		name: "XRP",
		description:
			"XRP is the native cryptocurrency of XRP Ledger, designed for payments and financial institutions by Ripple.",
		website: "https://ripple.com",
	},
	"ADA-USD": {
		name: "Cardano",
		description:
			"Cardano is a proof-of-stake blockchain platform founded on peer-reviewed research and developed through evidence-based methods.",
		website: "https://cardano.org",
	},
	"DOGE-USD": {
		name: "Dogecoin",
		description:
			"Dogecoin is a cryptocurrency featuring a likeness of the Shiba Inu dog. Originally created as a joke, it has grown into a popular meme coin.",
		website: "https://dogecoin.com",
	},
	"AVAX-USD": {
		name: "Avalanche",
		description:
			"Avalanche is an open-source platform for decentralized applications and enterprise blockchain deployments.",
		website: "https://avax.network",
	},
	"MATIC-USD": {
		name: "Polygon",
		description:
			"Polygon is a scaling solution for Ethereum that provides faster and cheaper transactions using Layer 2 sidechains.",
		website: "https://polygon.technology",
	},
	"DOT-USD": {
		name: "Polkadot",
		description:
			"Polkadot is a heterogeneous multi-chain protocol allowing diverse blockchains to transfer messages and value in a trust-free fashion.",
		website: "https://polkadot.network",
	},
};

// Enrichment is considered stale after 30 days
const STALE_DAYS = 30;

export class SymbolService {
	constructor(
		private symbolRepo: SymbolRepository,
		private dataProvider: IDataProvider,
		private redis: Redis,
		private logger: Logger,
		private discoveryProvider?: IDataProvider,
	) {}

	async ensureSymbol(
		ticker: string,
		type: "STOCK" | "CRYPTO",
		metadata?: { provider?: string; exchange?: string; currency?: string; name?: string },
	) {
		this.logger.debug(`Ensuring symbol exists: ${ticker} (${type})`);

		const existing = await this.symbolRepo.findByTicker(ticker);
		if (existing) {
			// Sync lotSize to Redis (ADR-0012)
			if (existing.lotSize) {
				await this.redis.hset("harvest:lot-sizes", ticker.toUpperCase(), existing.lotSize.toString());
			}
			return existing;
		}

		// Determine provider from metadata or default based on type
		let provider = metadata?.provider?.toLowerCase();
		if (!provider) {
			provider = type === "CRYPTO" ? "ccxt" : "yahoo";
		}

		// Automatic lotSize detection for IDX (1 lot = 100 shares)
		const lotSize = ticker.endsWith(".JK") ? 100 : 1;

		const newSym = await this.symbolRepo.create({
			ticker,
			type,
			provider,
			lotSize,
			exchange: metadata?.exchange,
			currency: metadata?.currency,
			name: metadata?.name || ticker,
		});

		// Sync lotSize to Redis (ADR-0012)
		await this.redis.hset("harvest:lot-sizes", ticker.toUpperCase(), lotSize.toString());

		this.logger.info(`New symbol created: ${ticker} (Provider: ${provider}, LotSize: ${lotSize})`);
		return newSym;
	}

	async getSymbols() {
		return await this.symbolRepo.findAll();
	}

	async getSymbolByTicker(ticker: string) {
		return await this.symbolRepo.findByTicker(ticker);
	}

	/**
	 * Check if enrichment data is stale (older than STALE_DAYS)
	 */
	private isStale(metadataUpdatedAt: Date | null): boolean {
		if (!metadataUpdatedAt) return true;
		const staleDate = new Date();
		staleDate.setDate(staleDate.getDate() - STALE_DAYS);
		return new Date(metadataUpdatedAt) < staleDate;
	}

	/**
	 * Enrich symbol with profile data from Yahoo Finance
	 * - Uses fallback data for known cryptocurrencies
	 * - Re-enriches if data is stale (>30 days)
	 */
	async enrichSymbol(ticker: string): Promise<any> {
		const startTime = Date.now();
		const existing = await this.symbolRepo.findByTicker(ticker);

		// Skip if recently enriched and has data (and currency!)
		if (existing?.metadataUpdatedAt && !this.isStale(existing.metadataUpdatedAt) && existing.currency) {
			this.logger.debug(`[${ticker}] Already fresh, skipping (${Date.now() - startTime}ms)`);

			// Still check for logo in background just in case it's missing physically
			import("./logo.service").then(({ logoService }) => {
				if (existing?.id) {
					logoService
						.ensureLogo(existing.id, ticker, existing.type as "STOCK" | "CRYPTO")
						.catch((err) => this.logger.error(`Failed to ensure logo for ${ticker} (fresh check)`, err));
				}
			});

			return existing;
		}

		this.logger.info(`[${ticker}] Enriching symbol metadata...`);

		// Check if it's a known crypto with fallback data
		const cryptoFallback = CRYPTO_PROFILES[ticker];

		try {
			const result: any = await this.dataProvider.fetchQuoteSummary(ticker, [
				"assetProfile",
				"quoteType",
				"price",
				"financialData",
				"defaultKeyStatistics",
				"recommendationTrend",
				"earnings",
			]);
			this.logger.debug(`[${ticker}] Yahoo API responded (${Date.now() - startTime}ms)`);
			const profile = result.assetProfile;
			const quoteType = result.quoteType;
			const price = result.price;
			const ks = result.defaultKeyStatistics;

			const updates: Record<string, any> = {
				metadataUpdatedAt: new Date(),
			};

			// Currency (from price module)
			if (price?.currency) {
				updates.currency = price.currency;
			}

			// Industry IDs
			if (quoteType?.isin) updates.isin = quoteType.isin;
			if (quoteType?.figi) updates.figi = quoteType.figi;

			// Fallback check for ISIN/FIGI in other modules if needed
			if (!updates.isin && ks?.isin) updates.isin = ks.isin;

			// Name from quoteType
			if (quoteType?.longName) updates.name = quoteType.longName;
			else if (quoteType?.shortName) updates.name = quoteType.shortName;
			else if (cryptoFallback?.name) updates.name = cryptoFallback.name;

			// Profile data (may be missing for crypto)
			if (profile) {
				if (profile.longBusinessSummary) updates.description = profile.longBusinessSummary;
				if (profile.sector) updates.sector = profile.sector;
				if (profile.industry) updates.industry = profile.industry;
				if (profile.website) updates.website = profile.website;
				if (profile.country) updates.country = profile.country;
			}

			// Apply crypto fallback if no description from Yahoo
			if (!updates.description && cryptoFallback) {
				this.logger.debug(`Using fallback profile for crypto: ${ticker}`);
				updates.description = cryptoFallback.description;
				if (!updates.website && cryptoFallback.website) {
					updates.website = cryptoFallback.website;
				}
			}

			await this.symbolRepo.updateByTicker(ticker, updates);

			// NEW: Discover TradingView Mapping
			if (this.discoveryProvider) {
				this.discoverTradingViewMapping(ticker, updates.name || ticker).catch((err) =>
					this.logger.error(`[${ticker}] Failed to discover TradingView mapping`, err),
				);
			}

			// Trigger Logo Download (Async, don't block response)
			// Dynamic import to avoid cycles since logo.service might import db
			import("./logo.service").then(({ logoService }) => {
				if (existing?.id) {
					logoService
						.ensureLogo(existing.id, ticker, existing.type as "STOCK" | "CRYPTO")
						.catch((err) => this.logger.error(`Failed to ensure logo for ${ticker}`, err));
				}
			});

			this.logger.info(`Enriched ${ticker}: ${updates.name || "N/A"}`);
			return await this.symbolRepo.findByTicker(ticker);
		} catch (error: any) {
			this.logger.warn(`Could not enrich ${ticker} from API: ${error?.message}`);

			// Still apply crypto fallback on error
			if (cryptoFallback) {
				this.logger.info(`Applying fallback profile for ${ticker}`);
				await this.symbolRepo.updateByTicker(ticker, {
					metadataUpdatedAt: new Date(),
					name: cryptoFallback.name,
					description: cryptoFallback.description,
					website: cryptoFallback.website,
				});
			} else {
				// Mark as attempted to prevent retries
				await this.symbolRepo.updateByTicker(ticker, { metadataUpdatedAt: new Date() });
			}

			return await this.symbolRepo.findByTicker(ticker);
		}
	}
	/**
	 * Search TradingView for a matching symbol to create a mapping
	 */
	private async discoverTradingViewMapping(ticker: string, name: string) {
		if (!this.discoveryProvider) return;

		try {
			this.logger.debug(`[${ticker}] Searching TradingView for mapping (Query: ${ticker} or ${name})...`);

			// Try searching by ticker first (clean ticker without suffix)
			const cleanTicker = ticker.split(".")[0].split("=")[0];
			let results = await this.discoveryProvider.search(cleanTicker, 10);

			// If no good results, try by name
			if (!results.length && name !== ticker) {
				results = await this.discoveryProvider.search(name, 10);
			}

			if (results.length > 0) {
				// Simple heuristic to find best match:
				// 1. Exact ticker match
				// 2. Ticker contains cleanTicker
				// 3. Name matches
				const bestMatch =
					results.find((r) => r.ticker === cleanTicker || r.ticker === ticker) ||
					results.find((r) => r.ticker.includes(cleanTicker)) ||
					results[0];

				this.logger.info(`[${ticker}] Found TradingView match: ${bestMatch.fullSymbol} (${bestMatch.exchange})`);

				await this.symbolRepo.updateByTicker(ticker, {
					tradingviewSymbol: bestMatch.ticker,
					tradingviewExchange: bestMatch.exchange,
				});
			} else {
				this.logger.debug(`[${ticker}] No TradingView match found for '${cleanTicker}' or '${name}'`);
			}
		} catch (err) {
			this.logger.error(`TradingView discovery failed for ${ticker}`, err);
		}
	}
}
