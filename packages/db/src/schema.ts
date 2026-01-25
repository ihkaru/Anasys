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

export const assetTypeEnum = pgEnum('asset_type', ['STOCK', 'CRYPTO']);

export const symbols = pgTable("symbols", {
    id: serial("id").primaryKey(),
    ticker: text("ticker").notNull().unique(), // e.g. "AAPL", "BTC/USDT"
    name: text("name"),
    type: assetTypeEnum("type").notNull(),
    provider: text("provider").default('yahoo'), // 'yahoo' or 'ccxt'
    isActive: boolean("is_active").default(true),
    iconUrl: text("icon_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // Extended metadata from Yahoo Finance quoteSummary
    description: text("description"), // longBusinessSummary
    sector: text("sector"),
    industry: text("industry"),
    website: text("website"),
    country: text("country"),
    metadataUpdatedAt: timestamp("metadata_updated_at", { withTimezone: true }),
});

export const categories = pgTable("categories", {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(), // e.g. "NASDAQ", "ETF", "Large Cap"
    slug: text("slug").notNull().unique(), // e.g. "nasdaq", "etf"
});

export const symbolCategories = pgTable("symbol_categories", {
    symbolId: integer("symbol_id").references(() => symbols.id, { onDelete: 'cascade' }).notNull(),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: 'cascade' }).notNull(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.symbolId, table.categoryId] }),
    };
});


export const watchlists = pgTable("watchlists", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    name: text("name").notNull(), // e.g., "My Favorites"
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const watchlistItems = pgTable("watchlist_items", {
    watchlistId: integer("watchlist_id").references(() => watchlists.id, { onDelete: 'cascade' }).notNull(),
    symbolId: integer("symbol_id").references(() => symbols.id, { onDelete: 'cascade' }).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.watchlistId, table.symbolId] }),
    };
});

export const marketData = pgTable("market_data", {
    symbolId: integer("symbol_id").references(() => symbols.id).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
    interval: text("interval").default("1d").notNull(),
}, (table) => {
    return {
        pk: primaryKey({ columns: [table.symbolId, table.timestamp, table.interval] }),
    };
});

// Portfolio Holdings - User's investment positions
export const holdings = pgTable("holdings", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    symbolId: integer("symbol_id").references(() => symbols.id, { onDelete: 'cascade' }).notNull(),
    shares: doublePrecision("shares").notNull(), // Number of shares/units
    avgCost: doublePrecision("avg_cost").notNull(), // Average purchase price
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

