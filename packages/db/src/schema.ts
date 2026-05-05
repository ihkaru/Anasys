import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	email: text("email").unique().notNull(),
	name: text("name"),
	googleId: text("google_id").unique(),
	createdAt: timestamp("created_at").defaultNow(),
});

// ...existing strategies table...
export const strategies = pgTable("strategies", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
});

// Market Data Extension
import { boolean, doublePrecision, integer, pgEnum, primaryKey } from "drizzle-orm/pg-core";

export const assetTypeEnum = pgEnum("asset_type", ["STOCK", "CRYPTO", "FOREX", "INDEX", "COMMODITY", "FUTURES"]);
export const dataSourceEnum = pgEnum("data_source", ["YAHOO", "TRADINGVIEW", "CCXT"]);

/**
 * Backfill status lifecycle (ADR-0013)
 * PENDING → IN_PROGRESS → COMPLETED → INCREMENTAL (loop)
 *                        ↓
 *                      FAILED (manual retry needed)
 */
export const backfillStatusEnum = pgEnum("backfill_status", [
	"PENDING",
	"IN_PROGRESS",
	"COMPLETED",
	"INCREMENTAL",
	"FAILED",
	"SKIPPED",
]);

/**
 * Alert status lifecycle (ADR-0014)
 * ACTIVE → [trigger] → TRIGGERED → [notify] → COOLDOWN → ACTIVE
 * ACTIVE/COOLDOWN → [user action] → PAUSED → ACTIVE
 * TRIGGERED → [condition cleared] → RESOLVED
 */
export const alertStatusEnum = pgEnum("alert_status", ["ACTIVE", "PAUSED", "TRIGGERED", "COOLDOWN", "RESOLVED"]);

/**
 * Delivery status for notifications
 */
export const deliveryStatusEnum = pgEnum("delivery_status", ["PENDING", "SENT", "FAILED"]);

export const symbols = pgTable("symbols", {
	id: serial("id").primaryKey(),
	ticker: text("ticker").notNull().unique(), // e.g. "AAPL", "BTC/USDT"
	name: text("name"),
	type: assetTypeEnum("type").notNull(),
	provider: text("provider").default("yahoo"), // 'yahoo' or 'ccxt' (Primary metadata provider)
	exchange: text("exchange"), // e.g. "NASDAQ", "NYSE", "BINANCE"
	currency: text("currency"), // e.g. "USD", "IDR"
	isActive: boolean("is_active").default(true),
	iconUrl: text("icon_url"),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
	// Extended metadata from Yahoo Finance quoteSummary
	description: text("description"), // longBusinessSummary
	sector: text("sector"),
	industry: text("industry"),
	website: text("website"),
	country: text("country"),
	tradingviewSymbol: text("tradingview_symbol"), // e.g. "GC1!", "AAPL"
	tradingviewExchange: text("tradingview_exchange"), // e.g. "COMEX", "NASDAQ"
	isin: text("isin"), // International Securities Identification Number
	figi: text("figi"), // Financial Instrument Global Identifier
	lotSize: integer("lot_size").default(1), // Default 1 share, IDX = 100 shares/lot
	metadataUpdatedAt: timestamp("metadata_updated_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
	id: serial("id").primaryKey(),
	name: text("name").notNull().unique(), // e.g. "NASDAQ", "ETF", "Large Cap"
	slug: text("slug").notNull().unique(), // e.g. "nasdaq", "etf"
});

export const symbolCategories = pgTable(
	"symbol_categories",
	{
		symbolId: integer("symbol_id")
			.references(() => symbols.id, { onDelete: "cascade" })
			.notNull(),
		categoryId: integer("category_id")
			.references(() => categories.id, { onDelete: "cascade" })
			.notNull(),
	},
	(table) => {
		return {
			pk: primaryKey({ columns: [table.symbolId, table.categoryId] }),
		};
	},
);

export const watchlists = pgTable("watchlists", {
	id: serial("id").primaryKey(),
	userId: integer("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	name: text("name").notNull(), // e.g., "My Favorites"
	isDefault: boolean("is_default").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const watchlistItems = pgTable(
	"watchlist_items",
	{
		watchlistId: integer("watchlist_id")
			.references(() => watchlists.id, { onDelete: "cascade" })
			.notNull(),
		symbolId: integer("symbol_id")
			.references(() => symbols.id, { onDelete: "cascade" })
			.notNull(),
		source: text("source").default("YAHOO").notNull(),
		addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => {
		return {
			pk: primaryKey({ columns: [table.watchlistId, table.symbolId, table.source] }),
		};
	},
);

// Portfolio Holdings - User's investment positions
export const holdings = pgTable("holdings", {
	id: serial("id").primaryKey(),
	userId: integer("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull(),
	source: text("source").default("YAHOO").notNull(),
	shares: doublePrecision("shares").notNull(), // Number of shares/units
	avgCost: doublePrecision("avg_cost").notNull(), // Average purchase price
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// =============================================
// NEW: Cached Financial & Analyst Data Tables
// =============================================

/**
 * Cached financial metrics from Yahoo quoteSummary
 * Modules: summaryDetail, financialData, defaultKeyStatistics
 */
export const symbolFinancials = pgTable("symbol_financials", {
	id: serial("id").primaryKey(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull()
		.unique(),

	// From summaryDetail
	trailingPE: doublePrecision("trailing_pe"),
	forwardPE: doublePrecision("forward_pe"),
	priceToBook: doublePrecision("price_to_book"),
	dividendYield: doublePrecision("dividend_yield"),
	exDividendDate: timestamp("ex_dividend_date", { withTimezone: true }),
	beta: doublePrecision("beta"),
	fiftyTwoWeekHigh: doublePrecision("fifty_two_week_high"),
	fiftyTwoWeekLow: doublePrecision("fifty_two_week_low"),
	fiftyDayAverage: doublePrecision("fifty_day_average"),
	twoHundredDayAverage: doublePrecision("two_hundred_day_average"),
	averageVolume: doublePrecision("average_volume"),
	marketCap: doublePrecision("market_cap"), // Snapshot Market Capitalization

	// From financialData
	totalRevenue: doublePrecision("total_revenue"),
	revenuePerShare: doublePrecision("revenue_per_share"),
	grossProfit: doublePrecision("gross_profit"),
	ebitda: doublePrecision("ebitda"),
	netIncomeToCommon: doublePrecision("net_income_to_common"),
	grossMargins: doublePrecision("gross_margins"),
	operatingMargins: doublePrecision("operating_margins"),
	profitMargins: doublePrecision("profit_margins"),
	returnOnEquity: doublePrecision("return_on_equity"),
	returnOnAssets: doublePrecision("return_on_assets"),
	debtToEquity: doublePrecision("debt_to_equity"),
	currentRatio: doublePrecision("current_ratio"),
	quickRatio: doublePrecision("quick_ratio"),
	freeCashflow: doublePrecision("free_cashflow"),
	targetMeanPrice: doublePrecision("target_mean_price"),
	targetHighPrice: doublePrecision("target_high_price"),
	targetLowPrice: doublePrecision("target_low_price"),
	recommendationMean: doublePrecision("recommendation_mean"), // 1=Strong Buy, 5=Strong Sell
	recommendationKey: text("recommendation_key"), // "buy", "hold", "sell"
	numberOfAnalystOpinions: integer("number_of_analyst_opinions"),

	// From defaultKeyStatistics
	sharesOutstanding: doublePrecision("shares_outstanding"),
	floatShares: doublePrecision("float_shares"),
	sharesShort: doublePrecision("shares_short"),
	shortRatio: doublePrecision("short_ratio"),
	heldPercentInsiders: doublePrecision("held_percent_insiders"),
	heldPercentInstitutions: doublePrecision("held_percent_institutions"),
	bookValue: doublePrecision("book_value"),
	enterpriseValue: doublePrecision("enterprise_value"),
	trailingEps: doublePrecision("trailing_eps"),
	forwardEps: doublePrecision("forward_eps"),
	pegRatio: doublePrecision("peg_ratio"),

	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Cached earnings data from Yahoo quoteSummary
 * Modules: earnings, earningsHistory, calendarEvents
 */
export const symbolEarnings = pgTable("symbol_earnings", {
	id: serial("id").primaryKey(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull()
		.unique(),

	// Calendar events
	nextEarningsDate: timestamp("next_earnings_date", { withTimezone: true }),
	nextExDividendDate: timestamp("next_ex_dividend_date", { withTimezone: true }),
	nextDividendDate: timestamp("next_dividend_date", { withTimezone: true }),

	// Recent quarterly earnings (JSON array of last 4 quarters)
	// Format: [{ date: "2024Q1", epsActual: 1.52, epsEstimate: 1.48, surprise: 0.04 }, ...]
	earningsHistory: text("earnings_history"), // JSON string

	// Revenue history (JSON array)
	revenueHistory: text("revenue_history"), // JSON string

	// Earnings trend (future estimates)
	earningsTrend: text("earnings_trend"), // JSON string

	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Cached analyst ratings breakdown
 * Module: recommendationTrend
 */
export const analystRatings = pgTable("analyst_ratings", {
	id: serial("id").primaryKey(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull()
		.unique(),

	// Current month breakdown
	strongBuy: integer("strong_buy").default(0),
	buy: integer("buy").default(0),
	hold: integer("hold").default(0),
	sell: integer("sell").default(0),
	strongSell: integer("strong_sell").default(0),

	// Historical trend (JSON array of monthly ratings)
	// Format: [{ period: "0m", strongBuy: 10, buy: 15, hold: 5, sell: 1, strongSell: 0 }, ...]
	ratingsTrend: text("ratings_trend"), // JSON string

	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Track historical data ingestion (backfill) progress for each symbol and interval.
 * ADR-0013: status enum replaces the boolean isCompleted field.
 */
export const backfillProgress = pgTable("backfill_progress", {
	id: serial("id").primaryKey(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull(),
	interval: text("interval").notNull(), // e.g., "1d", "1h", "1m"
	targetStartDate: timestamp("target_start_date", { withTimezone: true }).notNull(),
	lastBackfilledAt: timestamp("last_backfilled_at", { withTimezone: true }),
	lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }), // ADR-0013: for incremental sync
	// @deprecated — use backfillStatus instead. Kept for backward compat during migration.
	isCompleted: boolean("is_completed").default(false).notNull(),
	// ADR-0013: New lifecycle status
	backfillStatus: backfillStatusEnum("backfill_status").default("PENDING"),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * NEW: Corporate Actions Table
 * Tracks Stock Splits and Dividends history.
 */
export const corporateActions = pgTable("corporate_actions", {
	id: serial("id").primaryKey(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull(),
	type: text("type").notNull(), // 'SPLIT' or 'DIVIDEND'
	executionDate: timestamp("execution_date", { withTimezone: true }).notNull(),

	// For Dividends
	amount: doublePrecision("amount"),

	// For Splits
	ratio: text("ratio"), // e.g., "7:1"

	description: text("description"),
	source: text("source").default("YAHOO").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * NEW: Insider Transactions Table
 * Tracks trades by company insiders (Executives, Directors).
 */
export const insiderTransactions = pgTable("insider_transactions", {
	id: serial("id").primaryKey(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull(),
	insiderName: text("insider_name").notNull(),
	position: text("position"),
	transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull(),
	transactionType: text("transaction_type").notNull(), // 'BUY', 'SELL', 'GRANT', etc.
	shares: doublePrecision("shares"),
	price: doublePrecision("price"),
	value: doublePrecision("value"),
	source: text("source").default("YAHOO").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * NEW: Macro Economic Data Table
 * Tracks global indicators like Fed Rates, CPI, GDP.
 */
export const macroData = pgTable("macro_data", {
	id: serial("id").primaryKey(),
	indicatorCode: text("indicator_code").notNull(), // e.g., "FED_RATE", "CPI_USA", "GDP_IDN"
	indicatorName: text("indicator_name").notNull(),
	timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
	value: doublePrecision("value").notNull(),
	unit: text("unit"), // 'PERCENT', 'CURRENCY', 'INDEX'
	country: text("country").default("USA"),
	source: text("source").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
// Alerting System Tables (PineTS) — ADR-0014
// Enum types declared at top of file to avoid temporal dead zones.
// =============================================

export const alerts = pgTable("alerts", {
	id: serial("id").primaryKey(),
	userId: integer("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	symbolId: integer("symbol_id")
		.references(() => symbols.id, { onDelete: "cascade" })
		.notNull(),
	name: text("name").notNull(),
	pineScript: text("pine_script").notNull(), // Pine Script code to evaluate
	interval: text("interval").default("1h").notNull(),
	status: alertStatusEnum("status").default("ACTIVE").notNull(),
	lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
	cooldownMinutes: integer("cooldown_minutes").default(60),
	// Extra delivery config: { webhook_url, telegram_chat_id, etc. }
	params: text("params"), // JSON string for notification params
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const alertHistory = pgTable("alert_history", {
	id: serial("id").primaryKey(),
	alertId: integer("alert_id")
		.references(() => alerts.id, { onDelete: "cascade" })
		.notNull(),
	triggeredAt: timestamp("triggered_at", { withTimezone: true }).defaultNow().notNull(),
	message: text("message"),
	dataSnapshot: text("data_snapshot"), // JSON snapshot of indicator values at trigger time
	// Notification delivery tracking
	deliveryStatus: deliveryStatusEnum("delivery_status").default("PENDING").notNull(),
	deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});
